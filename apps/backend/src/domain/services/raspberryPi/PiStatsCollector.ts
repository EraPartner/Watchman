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

/** Per-poll measurements (one compound SSH exec; positional outputs). */
const DYNAMIC_COMMANDS: readonly string[] = [
  "vcgencmd measure_temp",
  "vcgencmd measure_clock arm",
  "vcgencmd measure_volts core",
  "vcgencmd get_throttled",
  "cat /proc/loadavg",
  "cat /proc/meminfo",
  "cat /proc/uptime",
];

/** Immutable per boot — fetched once per service lifetime, then cached. */
const STATIC_COMMANDS: readonly string[] = [
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
  /** vcgencmd get_throttled hex value. Non-zero = throttling/undervoltage active. */
  throttled: number | null;
  load: number | null;
  swap: number | null;
  memory: string | null;
  prettyName: string | null;
  processor: string | null;
  isRpi: boolean;
  rpiCliAvailable: boolean;
  rpiCliError?: string;
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
}

export class PiStatsCollector {
  // os-release/cpuinfo results, cached after the first successful direct fetch
  private staticInfo: {
    prettyName: string | null;
    processor: string | null;
    isRpi: boolean;
  } | null = null;

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
      load: null,
      swap: null,
      memory: null,
      prettyName: null,
      processor: null,
      isRpi: false,
      rpiCliAvailable: false,
    };

    let handle;
    try {
      handle = await this.deps.pigpio.connect({
        host: cfg.host,
        port: cfg.port,
        timeoutMs: cfg.timeoutMs,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new UnavailableError(`pigpiod connect failed: ${msg}`);
    }

    try {
      const [revRes, verRes, tickRes] = await Promise.allSettled([
        handle.getHardwareRevision(),
        handle.getPigpioVersion(),
        handle.getCurrentTick(),
      ]);
      if (revRes.status === "fulfilled") {
        snapshot.hwRevision = revRes.value;
        snapshot.piModel = getPiModel(revRes.value);
      }
      if (verRes.status === "fulfilled") snapshot.pigpioVersion = verRes.value;
      if (tickRes.status === "fulfilled")
        snapshot.uptime = Math.floor(tickRes.value / 1_000_000);
    } finally {
      await handle.end().catch(() => undefined);
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
  }

  private applyRelayInfo(snapshot: PiStatsSnapshot, info: RpiInfo): void {
    snapshot.rpiCliAvailable = true;
    if (info.cpuTemp !== null) snapshot.cpuTemp = info.cpuTemp;
    if (info.clockRate !== null) snapshot.clockRate = info.clockRate;
    if (info.voltage !== null) snapshot.voltage = info.voltage;
    if (info.load !== null) snapshot.load = info.load;
    if (info.swap !== null) snapshot.swap = info.swap;
    if (info.memory !== null) snapshot.memory = info.memory;
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
    });

    // One compound exec per cycle; static files only until cached
    const wantStatic = this.staticInfo === null;
    const commands = wantStatic
      ? [...DYNAMIC_COMMANDS, ...STATIC_COMMANDS]
      : DYNAMIC_COMMANDS;
    const res = await this.deps.ssh.exec(req(compoundCommand(commands)));
    const segments = splitSegments(res.stdout, commands.length);

    if (segments.every((s) => s === "")) {
      throw new UnavailableError("pi direct ssh produced no output");
    }

    const [
      tempOut,
      clockOut,
      voltsOut,
      throttledOut,
      loadOut,
      memOut,
      uptimeOut,
      cpuinfoOut,
      osOut,
    ] = segments;

    if (wantStatic) {
      const cpuInfo = parseProcCpuinfo(cpuinfoOut ?? "");
      this.staticInfo = {
        prettyName: parseOsRelease(osOut ?? ""),
        processor: cpuInfo.processor,
        isRpi: cpuInfo.isRpi,
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
    };
  }

  private async fetchRpiInfo(signal: AbortSignal): Promise<RpiInfo> {
    const c = this.deps.config;
    const command = `${c.nodePath} ${c.rpiCliPath} -H ${c.host}:${c.port} info`;
    const req: SshExecRequest = {
      host: c.macMiniHost,
      port: c.macMiniSshPort,
      user: c.macMiniSshUser,
      privateKeyPath: c.macMiniSshKeyPath,
      command,
      timeoutMs: c.timeoutMs,
      signal,
      ...(c.macMiniSshPassphrase ? { passphrase: c.macMiniSshPassphrase } : {}),
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
}

function parseProcCpuinfo(out: string): CpuInfoResult {
  const hwMatch = out.match(/^Hardware\s*:\s*(.+)$/im);
  const modelMatch = out.match(/^Model\s*:\s*(.+)$/im);
  const processor = hwMatch && hwMatch[1] ? hwMatch[1].trim() : null;
  const isRpi =
    modelMatch && modelMatch[1] ? /raspberry pi/i.test(modelMatch[1]) : false;
  return { processor, isRpi };
}

function parseOsRelease(out: string): string | null {
  const m = out.match(/^PRETTY_NAME="?([^"\n]+)"?/im);
  return m && m[1] ? m[1].trim() : null;
}
