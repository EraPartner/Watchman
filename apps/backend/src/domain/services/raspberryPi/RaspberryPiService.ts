import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, isDomainError } from '../../../core/errors.js';
import type { RaspberryPiInstance } from '../../../config/services.js';
import type { PigpioClient } from '../../../infra/gpio/pigpioClient.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { SshExecutor } from '../../../infra/ssh/sshExecutor.js';
import { PiHealthChecker } from './PiHealthChecker.js';
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
  private readonly health: PiHealthChecker;
  private readonly stats: PiStatsCollector;
  private readonly host: string;
  private readonly now: () => number;

  constructor(deps: RaspberryPiDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.now = deps.now;
    this.health = new PiHealthChecker({
      pigpio: deps.pigpio,
      ping: deps.ping,
      config: deps.config,
      now: deps.now,
    });
    this.stats = new PiStatsCollector({
      pigpio: deps.pigpio,
      ssh: deps.ssh,
      config: deps.config,
      now: deps.now,
    });
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const status = await this.health.check(signal);
    const details: Record<string, unknown> = {
      host: this.host,
      pigpioOnline: status.pigpioOnline,
    };
    if (status.warning) details['warning'] = status.warning;
    return ok({
      reachable: status.reachable,
      latencyMs: status.latencyMs,
      at: this.now(),
      details,
    });
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
