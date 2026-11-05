import type { PigpioClient } from "../../../infra/gpio/pigpioClient.js";
import type {
  SshExecutor,
  SshExecRequest,
} from "../../../infra/ssh/sshExecutor.js";
import type { RaspberryPiInstance } from "../../../config/services.js";
import { UnavailableError } from "../../../core/errors.js";
import { compoundCommand, splitSegments } from "../../../infra/ssh/compound.js";
import { getPiModel } from "./piModel.js";
import { parseRpiInfo, type RpiInfo } from "./parseRpiInfo.js";
import { shellQuote, shellQuotePath } from "../../../core/shellQuote.js";

const SYSTEMCTL_OK = "__watchman_systemctl_ok__";

/** Per-poll measurements (one compound SSH exec; positional outputs). Also
 *  the command list the read-only probe script must print, in this order. */
export const PI_DYNAMIC_COMMANDS: readonly string[] = [
  "vcgencmd measure_temp",
  "vcgencmd measure_clock arm",
  "vcgencmd measure_volts core",
  "vcgencmd get_throttled",
  "cat /proc/loadavg",
  "cat /proc/meminfo",
  "cat /proc/uptime",
  // CPU busy % comes from the delta of two polls' aggregate "cpu" lines
  "head -n 1 /proc/stat",
  "df -kP /",
  // "ro" here means the root filesystem was remounted read-only, a common
  // SD-card failure symptom
  "findmnt -no OPTIONS /",
  // the marker separates "no failed units" from "systemctl missing/failed"
  `systemctl --failed --no-legend --plain && echo ${SYSTEMCTL_OK}`,
  "cat /proc/net/dev",
];

/** Immutable per boot — fetched once per service lifetime, then cached. */
export const PI_STATIC_COMMANDS: readonly string[] = [
  "cat /proc/cpuinfo",
  "cat /etc/os-release",
];

export interface PiStatsSnapshot {
  host: string;
  port: number;
  piModel: string;
  hwRevision: number | null;
  pigpioVersion: number | null;
  uptime: number | null;
  cpuTemp: number | null;
  clockRate: number | null;
  voltage: number | null;
  /**
   * vcgencmd get_throttled raw value. Bits 0-3 are active now; bits 16-19 are
   * sticky "has occurred since boot" flags, so non-zero alone is not "active".
   */
  throttled: number | null;
  /** Bits 0-3 of throttled: undervoltage/capped/throttled/soft-temp-limit now. */
  throttledNow: number | null;
  /** Bits 16-19 of throttled, shifted down: the same conditions since boot. */
  throttledSinceBoot: number | null;
  load: number | null;
  swap: number | null;
  memory: string | null;
  prettyName: string | null;
  processor: string | null;
  isRpi: boolean;
  rpiCliAvailable: boolean;
  rpiCliError?: string;
  /** /proc/meminfo, bytes (direct SSH only). */
  memTotalBytes: number | null;
  memAvailableBytes: number | null;
  swapTotalBytes: number | null;
  swapUsedBytes: number | null;
  /** CPU busy % between this poll and the previous one (direct SSH only). */
  cpuUsagePercent: number | null;
  /** Root filesystem from `df -kP /`, bytes. */
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskUsagePercent: number | null;
  /** True when / is mounted read-only (SD-card failure symptom). */
  rootReadOnly: boolean | null;
  /** Failed systemd units; null when systemctl could not be asked. */
  failedUnits: number | null;
  failedUnitNames: string | null;
  /** Network byte rates summed over non-loopback interfaces. */
  netRxBps: number | null;
  netTxBps: number | null;
  /** Set when pigpiod could not be reached; SSH data may still be present. */
  pigpioError?: string;
}

export interface PiStatsDeps {
  pigpio: PigpioClient;
  ssh: SshExecutor;
  config: RaspberryPiInstance;
  now: () => number;
}

interface DirectPiInfo {
  cpuTemp: number | null;
  clockRate: number | null;
  voltage: number | null;
  throttled: number | null;
  load: number | null;
  memory: string | null;
  uptime: number | null;
  prettyName: string | null;
  processor: string | null;
  isRpi: boolean;
  /** /proc/cpuinfo `Revision` (hex), the same code pigpiod reports. */
  hwRevision: number | null;
  /** /proc/cpuinfo `Model` text, e.g. "Raspberry Pi 5 Model B Rev 1.0". */
  modelName: string | null;
  mem: MemInfo | null;
  cpuUsagePercent: number | null;
  disk: DfRoot | null;
  rootReadOnly: boolean | null;
  failedUnits: string[] | null;
  net: { rxBps: number; txBps: number } | null;
}

export class PiStatsCollector {
  // os-release/cpuinfo results, cached after the first successful direct fetch
  private staticInfo: {
    prettyName: string | null;
    processor: string | null;
    isRpi: boolean;
    hwRevision: number | null;
    modelName: string | null;
  } | null = null;

  // previous samples for the per-poll CPU and network deltas
  private lastCpu: CpuSample | null = null;
  private lastNet: { at: number; rx: number; tx: number } | null = null;

  constructor(private readonly deps: PiStatsDeps) {}

  async collect(signal: AbortSignal): Promise<PiStatsSnapshot> {
    const cfg = this.deps.config;
    const snapshot: PiStatsSnapshot = {
      host: cfg.host,
      port: cfg.port,
      piModel: "Unknown",
      hwRevision: null,
      pigpioVersion: null,
      uptime: null,
      cpuTemp: null,
      clockRate: null,
      voltage: null,
      throttled: null,
      throttledNow: null,
      throttledSinceBoot: null,
      load: null,
      swap: null,
      memory: null,
      prettyName: null,
      processor: null,
      isRpi: false,
      rpiCliAvailable: false,
      memTotalBytes: null,
      memAvailableBytes: null,
      swapTotalBytes: null,
      swapUsedBytes: null,
      cpuUsagePercent: null,
      diskTotalBytes: null,
      diskUsedBytes: null,
      diskUsagePercent: null,
      rootReadOnly: null,
      failedUnits: null,
      failedUnitNames: null,
      netRxBps: null,
      netTxBps: null,
    };

    // pigpiod is optional when SSH or the relay is configured: it doesn't run
    // on the Pi 5 family, and SSH supplies everything except hwRevision and
    // pigpioVersion. Its failure only fails stats when no other source works.
    let pigpioError: string | null = null;
    let handle;
    try {
      handle = await this.deps.pigpio.connect({
        host: cfg.host,
        port: cfg.port,
        timeoutMs: cfg.timeoutMs,
      });
    } catch (e) {
      pigpioError = e instanceof Error ? e.message : String(e);
    }

    if (handle) {
      try {
        // pigpio's current tick is not an uptime source: it is an unsigned
        // 32-bit microsecond counter that wraps every ~71.6 minutes. Uptime
        // comes from /proc/uptime (direct SSH) or the relay's boot time.
        const [revRes, verRes] = await Promise.allSettled([
          handle.getHardwareRevision(),
          handle.getPigpioVersion(),
        ]);
        if (revRes.status === "fulfilled") {
          snapshot.hwRevision = revRes.value;
          snapshot.piModel = getPiModel(revRes.value);
        }
        if (verRes.status === "fulfilled")
          snapshot.pigpioVersion = verRes.value;
      } finally {
        await handle.end().catch(() => undefined);
      }
    }

    // Prefer direct SSH; fall back to Mac Mini relay if direct fails or isn't configured.
    let directError: string | null = null;
    if (this.directSshReady()) {
      try {
        this.applyDirectSshInfo(
          snapshot,
          await this.fetchDirectSshInfo(signal)
        );
      } catch (e) {
        directError = e instanceof Error ? e.message : String(e);
      }
    }

    const directSucceeded = snapshot.rpiCliAvailable === true;
    if (!directSucceeded && this.macMiniReady()) {
      try {
        this.applyRelayInfo(snapshot, await this.fetchRpiInfo(signal));
      } catch (e) {
        const relayError = e instanceof Error ? e.message : String(e);
        snapshot.rpiCliError = directError
          ? `direct ssh: ${directError}; relay: ${relayError}`
          : relayError;
      }
    } else if (directError && !directSucceeded) {
      snapshot.rpiCliError = directError;
    }

    if (pigpioError !== null) {
      if (!snapshot.rpiCliAvailable) {
        throw new UnavailableError(
          snapshot.rpiCliError
            ? `pigpiod connect failed: ${pigpioError}; ${snapshot.rpiCliError}`
            : `pigpiod connect failed: ${pigpioError}`
        );
      }
      snapshot.pigpioError = pigpioError;
    }

    if (snapshot.throttled !== null) {
      snapshot.throttledNow = snapshot.throttled & 0xf;
      snapshot.throttledSinceBoot = (snapshot.throttled >>> 16) & 0xf;
    }

    return snapshot;
  }

  private applyDirectSshInfo(
    snapshot: PiStatsSnapshot,
    info: DirectPiInfo
  ): void {
    snapshot.rpiCliAvailable = true;
    if (info.cpuTemp !== null) snapshot.cpuTemp = info.cpuTemp;
    if (info.clockRate !== null) snapshot.clockRate = info.clockRate;
    if (info.voltage !== null) snapshot.voltage = info.voltage;
    if (info.throttled !== null) snapshot.throttled = info.throttled;
    if (info.load !== null) snapshot.load = info.load;
    if (info.memory !== null) snapshot.memory = info.memory;
    if (info.uptime !== null) snapshot.uptime = info.uptime;
    if (info.prettyName !== null) snapshot.prettyName = info.prettyName;
    if (info.processor !== null) snapshot.processor = info.processor;
    if (info.isRpi) snapshot.isRpi = true;
    if (info.mem) {
      snapshot.memTotalBytes = info.mem.totalBytes;
      snapshot.memAvailableBytes = info.mem.availableBytes;
      snapshot.swapTotalBytes = info.mem.swapTotalBytes;
      snapshot.swapUsedBytes = info.mem.swapUsedBytes;
    }
    snapshot.cpuUsagePercent = info.cpuUsagePercent;
    if (info.disk) {
      snapshot.diskTotalBytes = info.disk.totalBytes;
      snapshot.diskUsedBytes = info.disk.usedBytes;
      snapshot.diskUsagePercent = info.disk.usagePercent;
    }
    snapshot.rootReadOnly = info.rootReadOnly;
    if (info.failedUnits !== null) {
      snapshot.failedUnits = info.failedUnits.length;
      snapshot.failedUnitNames =
        info.failedUnits.length > 0 ? info.failedUnits.join(", ") : null;
    }
    if (info.net) {
      snapshot.netRxBps = info.net.rxBps;
      snapshot.netTxBps = info.net.txBps;
    }
    // pigpiod (when it answered) already set the model; without it (Pi 5,
    // no pigpiod) /proc/cpuinfo carries the same revision code
    if (snapshot.hwRevision === null) {
      if (info.hwRevision !== null) {
        snapshot.hwRevision = info.hwRevision;
        snapshot.piModel = getPiModel(info.hwRevision);
      }
      if (snapshot.piModel.startsWith("Unknown") && info.modelName !== null) {
        snapshot.piModel = info.modelName;
      }
    }
  }

  private applyRelayInfo(snapshot: PiStatsSnapshot, info: RpiInfo): void {
    snapshot.rpiCliAvailable = true;
    if (info.cpuTemp !== null) snapshot.cpuTemp = info.cpuTemp;
    if (info.clockRate !== null) snapshot.clockRate = info.clockRate;
    if (info.voltage !== null) snapshot.voltage = info.voltage;
    if (info.load !== null) snapshot.load = info.load;
    if (info.swap !== null) snapshot.swap = info.swap;
    if (info.memory !== null) snapshot.memory = info.memory;
    if (info.uptime !== null) snapshot.uptime = info.uptime;
    if (info.prettyName !== null) snapshot.prettyName = info.prettyName;
    if (info.processor !== null) snapshot.processor = info.processor;
    if (info.isRpi) snapshot.isRpi = true;
    if (info.hwRevision !== null && snapshot.hwRevision === null) {
      snapshot.hwRevision = info.hwRevision;
      snapshot.piModel = getPiModel(info.hwRevision);
    }
  }

  private directSshReady(): boolean {
    const c = this.deps.config;
    return Boolean(c.sshUser && c.sshKeyPath);
  }

  private macMiniReady(): boolean {
    const c = this.deps.config;
    return Boolean(
      c.macMiniHost && c.macMiniSshUser && c.macMiniSshKeyPath && c.rpiCliPath
    );
  }

  private async fetchDirectSshInfo(signal: AbortSignal): Promise<DirectPiInfo> {
    const c = this.deps.config;
    const req = (command: string): SshExecRequest => ({
      host: c.host,
      port: c.sshPort,
      user: c.sshUser,
      privateKeyPath: c.sshKeyPath,
      command,
      timeoutMs: c.timeoutMs,
      signal,
      ...(c.sshPassphrase ? { passphrase: c.sshPassphrase } : {}),
      ...(c.sshHostKey ? { hostKey: c.sshHostKey } : {}),
    });

    // One compound exec per cycle; static files only until cached
    const wantStatic = this.staticInfo === null;
    const commands = wantStatic
      ? [...PI_DYNAMIC_COMMANDS, ...PI_STATIC_COMMANDS]
      : PI_DYNAMIC_COMMANDS;
    const res = await this.deps.ssh.exec(req(compoundCommand(commands)));
    const segments = splitSegments(res.stdout, commands.length);

    if (segments.every((s) => s === "")) {
      throw new UnavailableError("pi direct ssh produced no output");
    }

    const seg = (cmd: string): string =>
      segments[commands.indexOf(cmd)] ?? "";
    const [tempOut, clockOut, voltsOut, throttledOut, loadOut, memOut, uptimeOut] =
      PI_DYNAMIC_COMMANDS.slice(0, 7).map(seg);
    const [statOut, dfOut, findmntOut, systemctlOut, netDevOut] =
      PI_DYNAMIC_COMMANDS.slice(7).map(seg);
    const cpuinfoOut = wantStatic ? seg(PI_STATIC_COMMANDS[0]!) : "";
    const osOut = wantStatic ? seg(PI_STATIC_COMMANDS[1]!) : "";

    const at = this.deps.now();
    const cpu = parseProcStatCpu(statOut ?? "");
    let cpuUsagePercent: number | null = null;
    if (cpu) {
      if (this.lastCpu) cpuUsagePercent = cpuBusyPercent(this.lastCpu, cpu);
      this.lastCpu = cpu;
    }
    const netTotals = parseProcNetDev(netDevOut ?? "");
    let net: { rxBps: number; txBps: number } | null = null;
    if (netTotals) {
      const last = this.lastNet;
      if (last && at > last.at) {
        const dt = (at - last.at) / 1000;
        const dRx = netTotals.rx - last.rx;
        const dTx = netTotals.tx - last.tx;
        // a negative delta is a counter reset (reboot, interface change)
        if (dRx >= 0 && dTx >= 0) {
          net = { rxBps: Math.round(dRx / dt), txBps: Math.round(dTx / dt) };
        }
      }
      this.lastNet = { at, ...netTotals };
    }

    if (wantStatic) {
      const cpuInfo = parseProcCpuinfo(cpuinfoOut ?? "");
      this.staticInfo = {
        prettyName: parseOsRelease(osOut ?? ""),
        processor: cpuInfo.processor,
        isRpi: cpuInfo.isRpi,
        hwRevision: cpuInfo.hwRevision,
        modelName: cpuInfo.modelName,
      };
    }

    return {
      cpuTemp: parseVcgencmdTemp(tempOut ?? ""),
      clockRate: parseVcgencmdClock(clockOut ?? ""),
      voltage: parseVcgencmdVolts(voltsOut ?? ""),
      throttled: parseVcgencmdThrottled(throttledOut ?? ""),
      load: parseProcLoadAvg(loadOut ?? ""),
      memory: parseProcMeminfoFormatted(memOut ?? ""),
      uptime: parseProcUptime(uptimeOut ?? ""),
      prettyName: this.staticInfo?.prettyName ?? null,
      processor: this.staticInfo?.processor ?? null,
      isRpi: this.staticInfo?.isRpi ?? false,
      hwRevision: this.staticInfo?.hwRevision ?? null,
      modelName: this.staticInfo?.modelName ?? null,
      mem: parseProcMeminfo(memOut ?? ""),
      cpuUsagePercent,
      disk: parseDfRoot(dfOut ?? ""),
      rootReadOnly: parseMountReadOnly(findmntOut ?? ""),
      failedUnits: parseFailedUnits(systemctlOut ?? ""),
      net,
    };
  }

  private async fetchRpiInfo(signal: AbortSignal): Promise<RpiInfo> {
    const c = this.deps.config;
    // Quoted: these are config values run by the relay host's shell, so a
    // path with a space (or anything worse) must stay one literal argument.
    const command = [
      shellQuotePath(c.nodePath),
      shellQuotePath(c.rpiCliPath),
      "-H",
      shellQuote(`${c.host}:${c.port}`),
      "info",
    ].join(" ");
    const req: SshExecRequest = {
      host: c.macMiniHost,
      port: c.macMiniSshPort,
      user: c.macMiniSshUser,
      privateKeyPath: c.macMiniSshKeyPath,
      command,
      timeoutMs: c.timeoutMs,
      signal,
      ...(c.macMiniSshPassphrase ? { passphrase: c.macMiniSshPassphrase } : {}),
      ...(c.macMiniSshHostKey ? { hostKey: c.macMiniSshHostKey } : {}),
    };
    const res = await this.deps.ssh.exec(req);
    if (res.code !== 0) {
      throw new UnavailableError(
        `rpi cli exit ${res.code}: ${res.stderr.slice(0, 200)}`
      );
    }
    const parsed: unknown = JSON.parse(res.stdout);
    return parseRpiInfo(parsed, this.deps.now);
  }
}

// ─── /proc, df, findmnt, systemctl parsers ─────────────────────────────────────

interface MemInfo {
  totalBytes: number | null;
  availableBytes: number | null;
  swapTotalBytes: number | null;
  swapUsedBytes: number | null;
}

export function parseProcMeminfo(out: string): MemInfo | null {
  const kb = (field: string): number | null => {
    const m = out.match(new RegExp(`^${field}:\\s+(\\d+)\\s+kB`, "im"));
    if (!m || !m[1]) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n * 1024 : null;
  };
  const totalBytes = kb("MemTotal");
  if (totalBytes === null) return null;
  const swapTotal = kb("SwapTotal");
  const swapFree = kb("SwapFree");
  return {
    totalBytes,
    availableBytes: kb("MemAvailable"),
    swapTotalBytes: swapTotal,
    swapUsedBytes:
      swapTotal !== null && swapFree !== null
        ? Math.max(0, swapTotal - swapFree)
        : null,
  };
}

interface CpuSample {
  idle: number;
  total: number;
}

/** Aggregate "cpu" line of /proc/stat: user nice system idle iowait irq
 *  softirq steal …; idle time is idle + iowait. */
export function parseProcStatCpu(out: string): CpuSample | null {
  const m = out.match(/^cpu\s+([\d\s]+)$/m);
  if (!m || !m[1]) return null;
  const nums = m[1].trim().split(/\s+/).map((x) => parseInt(x, 10));
  if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) return null;
  // guest/guest_nice (fields 9-10) are already counted in user/nice
  const total = nums.slice(0, 8).reduce((a, b) => a + b, 0);
  const idle = (nums[3] ?? 0) + (nums[4] ?? 0);
  return { idle, total };
}

export function cpuBusyPercent(prev: CpuSample, cur: CpuSample): number | null {
  const dTotal = cur.total - prev.total;
  const dIdle = cur.idle - prev.idle;
  if (dTotal <= 0 || dIdle < 0) return null;
  return Number((((dTotal - dIdle) / dTotal) * 100).toFixed(1));
}

interface DfRoot {
  totalBytes: number;
  usedBytes: number;
  usagePercent: number;
}

/** `df -kP /`: header, then "fs 1024-blocks used available capacity% mount". */
export function parseDfRoot(out: string): DfRoot | null {
  const line = out
    .trim()
    .split("\n")
    .find((l) => /\s\/$/.test(l.trim()));
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  const total = parseInt(parts[1] ?? "", 10);
  const used = parseInt(parts[2] ?? "", 10);
  const avail = parseInt(parts[3] ?? "", 10);
  if (![total, used, avail].every(Number.isFinite) || total <= 0) return null;
  // df's own capacity: used / (used + available), excluding reserved blocks
  const denom = used + avail;
  return {
    totalBytes: total * 1024,
    usedBytes: used * 1024,
    usagePercent: denom > 0 ? Math.round((used / denom) * 100) : 0,
  };
}

/** `findmnt -no OPTIONS /` prints e.g. "rw,noatime"; null when unknown. */
export function parseMountReadOnly(out: string): boolean | null {
  const opts = out.trim().split("\n")[0]?.trim() ?? "";
  if (opts === "") return null;
  const list = opts.split(",");
  if (list.includes("ro")) return true;
  if (list.includes("rw")) return false;
  return null;
}

/** `systemctl --failed --no-legend --plain && echo <marker>`: one unit per
 *  line, then the marker. Without the marker systemctl was not available. */
export function parseFailedUnits(out: string): string[] | null {
  const lines = out.trim().split("\n").map((l) => l.trim());
  if (!lines.includes(SYSTEMCTL_OK)) return null;
  return lines
    .filter((l) => l !== "" && l !== SYSTEMCTL_OK)
    .map((l) => l.split(/\s+/)[0] ?? "")
    .filter((u) => u !== "");
}

/** Sum of receive/transmit bytes over all interfaces except loopback. */
export function parseProcNetDev(out: string): { rx: number; tx: number } | null {
  let rx = 0;
  let tx = 0;
  let seen = 0;
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*([^:\s]+):\s*(.*)$/);
    if (!m || !m[1] || m[2] === undefined) continue;
    if (m[1] === "lo") continue;
    const f = m[2].trim().split(/\s+/).map((x) => Number(x));
    // fields: rx bytes packets errs drop fifo frame compressed multicast,
    // then tx bytes …
    const r = f[0];
    const t = f[8];
    if (r === undefined || t === undefined) continue;
    if (!Number.isFinite(r) || !Number.isFinite(t)) continue;
    rx += r;
    tx += t;
    seen += 1;
  }
  return seen > 0 ? { rx, tx } : null;
}

// ─── vcgencmd parsers ──────────────────────────────────────────────────────────

function parseVcgencmdTemp(out: string): number | null {
  // "temp=45.1'C"
  const m = out.match(/temp=([0-9.]+)/);
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseVcgencmdClock(out: string): number | null {
  // "frequency(48)=1500000000"
  const m = out.match(/=(\d+)/);
  if (!m || !m[1]) return null;
  const hz = parseInt(m[1], 10);
  return Number.isFinite(hz) && hz > 0 ? Math.round(hz / 1_000_000) : null;
}

function parseVcgencmdVolts(out: string): number | null {
  // "volt=0.8813V"
  const m = out.match(/volt=([0-9.]+)/);
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseVcgencmdThrottled(out: string): number | null {
  // "throttled=0x0" or "throttled=0x50005"
  const m = out.match(/throttled=(0x[0-9a-fA-F]+|\d+)/);
  if (!m || !m[1]) return null;
  const str = m[1];
  const n = str.startsWith("0x") ? parseInt(str, 16) : parseInt(str, 10);
  return Number.isFinite(n) ? n : null;
}

// ─── /proc parsers ─────────────────────────────────────────────────────────────

function parseProcLoadAvg(out: string): number | null {
  const first = out.trim().split(/\s+/)[0];
  if (!first) return null;
  const n = parseFloat(first);
  return Number.isFinite(n) ? n : null;
}

function parseProcMeminfoFormatted(out: string): string | null {
  const m = out.match(/MemTotal:\s+(\d+)\s+kB/i);
  if (!m || !m[1]) return null;
  const totalKb = parseInt(m[1], 10);
  const totalGb = (totalKb * 1024) / 1024 ** 3;
  return `${totalGb.toFixed(1)} GB`;
}

function parseProcUptime(out: string): number | null {
  const first = out.trim().split(/\s+/)[0];
  if (!first) return null;
  const n = parseFloat(first);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

interface CpuInfoResult {
  processor: string | null;
  isRpi: boolean;
  hwRevision: number | null;
  modelName: string | null;
}

function parseProcCpuinfo(out: string): CpuInfoResult {
  const hwMatch = out.match(/^Hardware\s*:\s*(.+)$/im);
  const modelMatch = out.match(/^Model\s*:\s*(.+)$/im);
  // "Revision\t: d04170" (new-style) or "Revision\t: 000e" (old-style)
  const revMatch = out.match(/^Revision\s*:\s*([0-9a-f]+)\s*$/im);
  const processor = hwMatch && hwMatch[1] ? hwMatch[1].trim() : null;
  const modelName = modelMatch && modelMatch[1] ? modelMatch[1].trim() : null;
  const isRpi = modelName !== null ? /raspberry pi/i.test(modelName) : false;
  const rev = revMatch && revMatch[1] ? parseInt(revMatch[1], 16) : NaN;
  const hwRevision = Number.isFinite(rev) && rev > 0 ? rev : null;
  return { processor, isRpi, hwRevision, modelName };
}

function parseOsRelease(out: string): string | null {
  const m = out.match(/^PRETTY_NAME="?([^"\n]+)"?/im);
  return m && m[1] ? m[1].trim() : null;
}
