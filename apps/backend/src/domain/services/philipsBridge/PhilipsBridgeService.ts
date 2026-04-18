import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { ok } from '../../../core/result.js';
import type { PhilipsBridgeInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';

export interface PhilipsBridgeDeps {
  ping: PingProber;
  config: PhilipsBridgeInstance;
  now: () => number;
}

export class PhilipsBridgeService extends BaseService {
  readonly kind = 'philipsBridge';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly pinger: PingProber;
  private readonly now: () => number;

  constructor(deps: PhilipsBridgeDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.pinger = deps.ping;
    this.now = deps.now;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const res = await this.pinger.probe({
      host: this.host,
      timeoutMs: this.timeoutMs,
      count: this.pingCount,
      signal,
    });
    const latencyMs = res.avgMs ?? this.now() - started;
    return ok({
      reachable: res.success,
      latencyMs,
      at: this.now(),
      details: { host: this.host, icmpAlive: res.success },
    });
  }

  async getStats(_signal: AbortSignal): Promise<StatsResult> {
    return ok({
      at: this.now(),
      metrics: {
        host: this.host,
        configured: Boolean(this.host),
      },
    });
  }
}
