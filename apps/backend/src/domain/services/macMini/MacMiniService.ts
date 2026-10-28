import {
  BaseService,
  type HealthResult,
  type HostHealth,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { ok, err } from "../../../core/result.js";
import {
  UnavailableError,
  UnauthorizedError,
  isDomainError,
} from "../../../core/errors.js";
import type { MacMiniInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type {
  SshExecutor,
  SshExecRequest,
} from "../../../infra/ssh/sshExecutor.js";
import { compoundCommand, splitSegments } from "../../../infra/ssh/compound.js";

export interface MacMiniDeps {
  ping: PingProber;
  ssh: SshExecutor;
  config: MacMiniInstance;
  now: () => number;
}

// A non-interactive SSH session on macOS has PATH=/usr/bin:/bin:/usr/sbin:/sbin,
// so Homebrew tools need their prefixes added. compoundCommand runs each
// segment in its own subshell, so every segment that needs them sets PATH.
const HOMEBREW_PATH = 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH";';
// smctemp works on Apple Silicon where the unmaintained osx-cpu-temp reads 0.0
export const TEMP_CMD = `${HOMEBREW_PATH} if which smctemp >/dev/null 2>&1; then smctemp -c; elif which osx-cpu-temp >/dev/null 2>&1; then osx-cpu-temp; fi`;
// On APFS (macOS 10.15+) "/" is the sealed system volume, whose "Used" is
// only the OS (~10-15 GB); user data lives on the Data volume.
export const DF_CMD = "df -k /System/Volumes/Data 2>/dev/null || df -k /";
export const SMART_CMD = `${HOMEBREW_PATH} which smartctl >/dev/null 2>&1 && smartctl -j -a disk0 2>/dev/null || true`;

// top's first sample has no previous one to diff against, so its CPU line is
// not a current measurement; take two samples 1 s apart and use the second
// (adds ~1 s to the compound exec, well inside the default 5 s timeout)
export const TOP_CMD = "top -l 2 -n 0 -s 1";

/** All stats commands, executed as ONE compound SSH exec per cycle
 *  (order matters — outputs are split positionally). */
export const MAC_STATS_COMMANDS: readonly string[] = [
  "uptime",
  DF_CMD,
  TEMP_CMD,
  "vm_stat",
  "pmset -g batt",
  TOP_CMD,
  "ifconfig en0",
  SMART_CMD,
];

export class MacMiniService extends BaseService {
  readonly kind = "macMini";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly pinger: PingProber;
  private readonly ssh: SshExecutor;
  private readonly sshUser: string;
  private readonly sshPort: number;
  private readonly sshKeyPath: string;
  private readonly sshPassphrase: string;
  private readonly sshHostKey: string;
  private readonly now: () => number;

  constructor(deps: MacMiniDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.pinger = deps.ping;
    this.ssh = deps.ssh;
    this.sshUser = deps.config.sshUser;
    this.sshPort = deps.config.sshPort;
    this.sshKeyPath = deps.config.sshKeyPath;
    this.sshPassphrase = deps.config.sshPassphrase;
    this.sshHostKey = deps.config.sshHostKey;
    this.now = deps.now;
  }

  private get sshReady(): boolean {
    return Boolean(this.sshUser && this.sshKeyPath);
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const res = await this.pinger.probe({
      host: this.host,
      timeoutMs: this.timeoutMs,
      count: this.pingCount,
      signal,
    });
    const host: HostHealth = {
      reachable: res.success,
      ...(res.avgMs !== undefined ? { pingMs: res.avgMs } : {}),
    };
    return ok({
      reachable: res.success,
      latencyMs: res.avgMs ?? this.now() - started,
      at: this.now(),
      host,
      details: { host: this.host, sshConfigured: this.sshReady },
    });
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    if (!this.sshReady) {
      return err(new UnauthorizedError("macMini ssh not configured"));
    }
    try {
      // one SSH exec per cycle; segments are positional and failure-tolerant
      const out = await this.exec(compoundCommand(MAC_STATS_COMMANDS), signal);
      const [
        uptimeOut,
        dfOut,
        tempOut,
        vmStatOut,
        pmsetOut,
        topOut,
        ifconfigOut,
        smartOut,
      ] = splitSegments(out, MAC_STATS_COMMANDS.length);

      if (!uptimeOut && !dfOut) {
        throw new UnavailableError(
          "macMini ssh produced no output for core commands"
        );
      }

      const cpuLoad = parseCpuLoad(uptimeOut ?? "");
      const cpuTemp = parseTemp(tempOut ?? "");
      const disk = parseDiskBytes(dfOut ?? "");
      const uptime = parseUptimeSeconds(uptimeOut ?? "");
      const mem = parseVmStat(vmStatOut ?? "");
      const power = parsePmset(pmsetOut ?? "");
      const topCpu = parseTopCpu(topOut ?? "");
      const netInfo = parseIfconfig(ifconfigOut ?? "");
      const smart = parseSmartctl(smartOut ?? "");

      return ok({
        at: this.now(),
        metrics: {
          host: this.host,
          // null = not measured (no load line / no temp tool), never a fake 0
          cpuLoad,
          cpuTemp,
          // busy % from top; cpuLoad above is the 1-minute load average
          cpuUsagePercent:
            topCpu?.cpuUser != null && topCpu.cpuSys != null
              ? Number((topCpu.cpuUser + topCpu.cpuSys).toFixed(2))
              : null,
          cpuUser: topCpu?.cpuUser ?? null,
          cpuSys: topCpu?.cpuSys ?? null,
          cpuIdle: topCpu?.cpuIdle ?? null,
          processCount: topCpu?.processCount ?? null,
          diskTotal: disk.total,
          diskUsed: disk.used,
          diskFree: disk.free,
          diskUsagePercent: disk.usagePercent,
          diskModel: smart?.diskModel ?? null,
          diskTemp: smart?.diskTemp ?? null,
          smartPassed: smart?.smartPassed ?? null,
          memFreeBytes: mem?.memFreeBytes ?? null,
          memActiveBytes: mem?.memActiveBytes ?? null,
          memWiredBytes: mem?.memWiredBytes ?? null,
          memInactiveBytes: mem?.memInactiveBytes ?? null,
          memTotalBytes: mem?.memTotalBytes ?? null,
          onAC: power?.onAC ?? null,
          batteryPercent: power?.batteryPercent ?? null,
          batteryCharging: power?.batteryCharging ?? null,
          ipAddress: netInfo?.ipAddress ?? null,
          interfaceUp: netInfo?.interfaceUp ?? null,
          uptime,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`macMini stats failed: ${msg}`));
    }
  }

  private async exec(command: string, signal: AbortSignal): Promise<string> {
    const req: SshExecRequest = {
      host: this.host,
      port: this.sshPort,
      user: this.sshUser,
      privateKeyPath: this.sshKeyPath,
      command,
      timeoutMs: this.timeoutMs,
      signal,
      ...(this.sshPassphrase ? { passphrase: this.sshPassphrase } : {}),
      ...(this.sshHostKey ? { hostKey: this.sshHostKey } : {}),
    };
    const res = await this.ssh.exec(req);
    if (res.code !== 0) {
      throw new UnavailableError(
        `macMini ssh ${command} exit ${res.code}: ${res.stderr.slice(0, 200)}`
      );
    }
    return res.stdout;
  }
}

function parseCpuLoad(uptime: string): number | null {
  const m = uptime.match(/load averages?:?\s*([0-9.,\s]+)/i);
  if (!m || !m[1]) return null;
  const first = m[1]
    .split(/[ ,]+/)
    .map((p) => p.trim())
    .filter(Boolean)[0];
  if (!first) return null;
  const n = parseFloat(first);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function parseTemp(out: string): number | null {
  const last = out.trim().split(/\s+/).pop();
  if (!last) return null;
  const cleaned = last.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// null = df gave no usable output (not measured), never a fake 0
interface Disk {
  total: number | null;
  used: number | null;
  free: number | null;
  usagePercent: number | null;
}

const NO_DISK: Disk = { total: null, used: null, free: null, usagePercent: null };

function parseDiskBytes(dfOut: string): Disk {
  const lines = dfOut
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines[1])
    return NO_DISK;
  const cols = lines[1].split(/\s+/);
  const totalK = parseInt(cols[1] ?? "0", 10);
  const usedK = parseInt(cols[2] ?? "0", 10);
  const availK = parseInt(cols[3] ?? "0", 10);
  if (!Number.isFinite(totalK) || totalK <= 0)
    return NO_DISK;
  const total = totalK * 1024;
  const used = (Number.isFinite(usedK) ? usedK : 0) * 1024;
  const free = (Number.isFinite(availK) ? availK : 0) * 1024;
  // APFS volumes share the container's free space, so "how full" is
  // (total - available), not this volume's own Used column
  const usagePercent = Math.round(((total - free) / total) * 100);
  return { total, used, free, usagePercent };
}

/**
 * Parses BSD/macOS `uptime`, whose duration is "N day(s)," followed by one of
 * "H:MM", "N hr(s)", "N min(s)" or "N sec(s)" (e.g. "up 3 days, 14 mins,").
 */
export function parseUptimeSeconds(uptime: string): number | null {
  const m = uptime.match(/\bup\s+(.*?)(?:,\s*\d+\s+users?\b|,\s*load\b|$)/i);
  const span = m?.[1];
  if (!span) return null;
  const num = (re: RegExp): number => {
    const hit = span.match(re);
    return hit?.[1] ? parseInt(hit[1], 10) : 0;
  };
  let seconds = num(/(\d+)\s+days?\b/i) * 86400;
  const hm = span.match(/(\d+):(\d+)/);
  if (hm?.[1] && hm[2]) {
    seconds += parseInt(hm[1], 10) * 3600 + parseInt(hm[2], 10) * 60;
  }
  seconds += num(/(\d+)\s+(?:hrs?|hours?)\b/i) * 3600;
  seconds += num(/(\d+)\s+(?:mins?|minutes?)\b/i) * 60;
  seconds += num(/(\d+)\s+(?:secs?|seconds?)\b/i);
  return seconds > 0 ? seconds : null;
}

// --- Extended parsers ---

interface VmStatResult {
  memFreeBytes: number;
  memActiveBytes: number;
  memWiredBytes: number;
  memInactiveBytes: number;
  memTotalBytes: number;
}

function parseVmStat(out: string): VmStatResult | null {
  if (!out.trim()) return null;
  const pageSizeMatch = out.match(/page size of (\d+) bytes/i);
  const pageSize =
    pageSizeMatch && pageSizeMatch[1] ? parseInt(pageSizeMatch[1], 10) : 4096;

  const getPages = (label: string): number => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = out.match(new RegExp(`${escaped}:\\s*(\\d+)\\.?`, "i"));
    return m && m[1] ? parseInt(m[1], 10) : 0;
  };

  const free = getPages("Pages free");
  const active = getPages("Pages active");
  const inactive = getPages("Pages inactive");
  const wired = getPages("Pages wired down");
  const speculative = getPages("Pages speculative");
  const compressor = getPages("Pages occupied by compressor");

  const used = active + inactive + wired + compressor;
  const total = used + free + speculative;

  return {
    memFreeBytes: free * pageSize,
    memActiveBytes: active * pageSize,
    memWiredBytes: wired * pageSize,
    memInactiveBytes: inactive * pageSize,
    memTotalBytes: total * pageSize,
  };
}

interface PmsetResult {
  onAC: boolean;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
}

function parsePmset(out: string): PmsetResult | null {
  if (!out.trim()) return null;
  const onAC = /AC Power/i.test(out);
  const battMatch = out.match(/(\d+)%/);
  const batteryPercent =
    battMatch && battMatch[1] ? parseInt(battMatch[1], 10) : null;
  // "AC attached; not charging" (optimized/held charge) is not charging
  const batteryCharging =
    /\bcharging\b/i.test(out) &&
    !/\bnot charging\b/i.test(out) &&
    !/\bcharged\b/i.test(out)
      ? true
      : /\b(?:discharging|charged|not charging)\b/i.test(out)
        ? false
        : null;
  return { onAC, batteryPercent, batteryCharging };
}

interface TopCpuResult {
  cpuUser: number | null;
  cpuSys: number | null;
  cpuIdle: number | null;
  processCount: number | null;
}

function parseTopCpu(out: string): TopCpuResult | null {
  if (!out.trim()) return null;
  // `top -l 2` prints two samples; the last one is the real measurement
  const cpuMatch = [
    ...out.matchAll(
      /CPU usage:\s*([\d.]+)%\s*user,\s*([\d.]+)%\s*sys,\s*([\d.]+)%\s*idle/gi
    ),
  ].at(-1);
  if (!cpuMatch) return null;
  const cpuUser = parseFloat(cpuMatch[1] ?? "0");
  const cpuSys = parseFloat(cpuMatch[2] ?? "0");
  const cpuIdle = parseFloat(cpuMatch[3] ?? "0");
  const procMatch = [...out.matchAll(/Processes:\s*(\d+)\s*total/gi)].at(-1);
  const processCount =
    procMatch && procMatch[1] ? parseInt(procMatch[1], 10) : null;
  return {
    cpuUser: Number.isFinite(cpuUser) ? Number(cpuUser.toFixed(2)) : null,
    cpuSys: Number.isFinite(cpuSys) ? Number(cpuSys.toFixed(2)) : null,
    cpuIdle: Number.isFinite(cpuIdle) ? Number(cpuIdle.toFixed(2)) : null,
    processCount,
  };
}

interface IfconfigResult {
  ipAddress: string | null;
  interfaceUp: boolean;
}

function parseIfconfig(out: string): IfconfigResult | null {
  if (!out.trim()) return null;
  const ipMatch = out.match(/inet\s+((?:\d+\.){3}\d+)\s+netmask/i);
  const interfaceUp = /\bUP\b/.test(out) && /status:\s*active/i.test(out);
  return {
    ipAddress: ipMatch && ipMatch[1] ? ipMatch[1] : null,
    interfaceUp,
  };
}

interface SmartctlResult {
  smartPassed: boolean | null;
  diskTemp: number | null;
  diskModel: string | null;
}

function parseSmartctl(out: string): SmartctlResult | null {
  if (!out.trim()) return null;
  try {
    const json = JSON.parse(out) as {
      smart_status?: { passed?: boolean };
      temperature?: { current?: number };
      model_name?: string;
    };
    return {
      smartPassed: json.smart_status?.passed ?? null,
      diskTemp: json.temperature?.current ?? null,
      diskModel: json.model_name ?? null,
    };
  } catch {
    return null;
  }
}
