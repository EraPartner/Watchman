import { BaseService, type HealthResult, type HostHealth, type ServiceHealth, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, isDomainError } from '../../../core/errors.js';
import type { RaspberryPiInstance } from '../../../config/services.js';
import type { PigpioClient } from '../../../infra/gpio/pigpioClient.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { SshExecutor } from '../../../infra/ssh/sshExecutor.js';
import { PiStatsCollector } from './PiStatsCollector.js';

export interface RaspberryPiDeps {
  pigpio: PigpioClient;
  ping: PingProber;
  ssh: SshExecutor;
  config: RaspberryPiInstance;
  now: () => number;
}

export class RaspberryPiService extends BaseService {
  readonly kind = 'raspberryPi';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly stats: PiStatsCollector;
  private readonly host: string;
  private readonly piPort: number;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly pinger: PingProber;
  private readonly pigpioClient: PigpioClient;
  private readonly now: () => number;

  constructor(deps: RaspberryPiDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.piPort = deps.config.port;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.pinger = deps.ping;
    this.pigpioClient = deps.pigpio;
    this.now = deps.now;
    this.stats = new PiStatsCollector({
      pigpio: deps.pigpio,
      ssh: deps.ssh,
      config: deps.config,
      now: deps.now,
    });
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const [pingSettled, pigpioSettled] = await Promise.allSettled([
      this.pinger.probe({ host: this.host, timeoutMs: this.timeoutMs, count: this.pingCount, signal }),
      this.checkPigpio(),
    ]);

    const pingRes = pingSettled.status === 'fulfilled' ? pingSettled.value : null;
    const host: HostHealth = pingRes
      ? { reachable: pingRes.success, ...(pingRes.avgMs !== undefined ? { pingMs: pingRes.avgMs } : {}) }
      : { reachable: false };

    const pigpioResult = pigpioSettled.status === 'fulfilled' ? pigpioSettled.value : { online: false, error: pigpioSettled.reason instanceof Error ? pigpioSettled.reason.message : String(pigpioSettled.reason) };
    const service: ServiceHealth = {
      reachable: pigpioResult.online,
      ...(pigpioResult.error ? { message: `pigpiod unavailable: ${pigpioResult.error}` } : {}),
      details: { port: this.piPort },
    };

    const reachable = host.reachable || service.reachable;
    const latencyMs = pingRes?.avgMs ?? this.now() - started;
    const details: Record<string, unknown> = { host: this.host, pigpioOnline: pigpioResult.online };
    if (service.message) details['warning'] = service.message;

    return ok({ reachable, latencyMs, at: this.now(), host, service, details });
  }

  private async checkPigpio(): Promise<{ online: boolean; error?: string }> {
    try {
      const handle = await this.pigpioClient.connect({
        host: this.host,
        port: this.piPort,
        timeoutMs: this.timeoutMs,
      });
      await handle.end().catch(() => undefined);
      return { online: true };
    } catch (e) {
      return { online: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const snap = await this.stats.collect(signal);
      return ok({ at: this.now(), metrics: { ...snap } });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`raspberryPi stats failed: ${msg}`));
    }
  }
}
