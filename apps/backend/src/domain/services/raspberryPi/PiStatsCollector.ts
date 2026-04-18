import type { PigpioClient } from '../../../infra/gpio/pigpioClient.js';
import type { SshExecutor, SshExecRequest } from '../../../infra/ssh/sshExecutor.js';
import type { RaspberryPiInstance } from '../../../config/services.js';
import { UnavailableError } from '../../../core/errors.js';
import { getPiModel } from './piModel.js';
import { parseRpiInfo, type RpiInfo } from './parseRpiInfo.js';

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

export class PiStatsCollector {
  constructor(private readonly deps: PiStatsDeps) {}

  async collect(signal: AbortSignal): Promise<PiStatsSnapshot> {
    const cfg = this.deps.config;
    const snapshot: PiStatsSnapshot = {
      host: cfg.host,
      port: cfg.port,
      piModel: 'Unknown',
      hwRevision: null,
      pigpioVersion: null,
      uptime: null,
      cpuTemp: null,
      clockRate: null,
      voltage: null,
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
      if (revRes.status === 'fulfilled') {
        snapshot.hwRevision = revRes.value;
        snapshot.piModel = getPiModel(revRes.value);
      }
      if (verRes.status === 'fulfilled') snapshot.pigpioVersion = verRes.value;
      if (tickRes.status === 'fulfilled') snapshot.uptime = Math.floor(tickRes.value / 1_000_000);
    } finally {
      await handle.end().catch(() => undefined);
    }

    if (this.sshReady()) {
      try {
        const info = await this.fetchRpiInfo(signal);
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
      } catch (e) {
        snapshot.rpiCliError = e instanceof Error ? e.message : String(e);
      }
    }

    return snapshot;
  }

  private sshReady(): boolean {
    const c = this.deps.config;
    return Boolean(c.macMiniHost && c.macMiniSshUser && c.macMiniSshKeyPath && c.rpiCliPath);
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
      throw new UnavailableError(`rpi cli exit ${res.code}: ${res.stderr.slice(0, 200)}`);
    }
    const parsed: unknown = JSON.parse(res.stdout);
    return parseRpiInfo(parsed, this.deps.now);
  }
}
