import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { ok } from '../../../core/result.js';
import type { RouterInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { TcpProber } from '../../../infra/net/tcpProbe.js';

export interface RouterDeps {
  ping: PingProber;
  tcp: TcpProber;
  config: RouterInstance;
  now: () => number;
}

export class RouterService extends BaseService {
  readonly kind = 'router';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly host: string;
  private readonly ports: ReadonlyArray<number>;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly pinger: PingProber;
  private readonly tcp: TcpProber;
  private readonly now: () => number;

  constructor(deps: RouterDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.ports = deps.config.ports;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.pinger = deps.ping;
    this.tcp = deps.tcp;
    this.now = deps.now;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const pingPromise = this.pinger.probe({
      host: this.host,
      timeoutMs: this.timeoutMs,
      count: this.pingCount,
      signal,
    });
    const portPromises = this.ports.map((port) =>
      this.tcp.probe({ host: this.host, port, timeoutMs: this.timeoutMs, signal }),
    );
    const [pingRes, ...portResults] = await Promise.all([pingPromise, ...portPromises]);

    const ports: Record<string, boolean> = {};
    this.ports.forEach((port, i) => {
      ports[String(port)] = Boolean(portResults[i]);
    });

    const anyPortOpen = Object.values(ports).some((v) => v);
    const icmpAlive = pingRes.success;
    const reachable = anyPortOpen || icmpAlive;
    const latencyMs = pingRes.avgMs ?? this.now() - started;

    return ok({
      reachable,
      latencyMs,
      at: this.now(),
      details: {
        icmpAlive,
        anyPortOpen,
        ports,
        host: this.host,
      },
    });
  }

  async getStats(_signal: AbortSignal): Promise<StatsResult> {
    return ok({
      at: this.now(),
      metrics: {
        host: this.host,
        portCount: this.ports.length,
        configured: Boolean(this.host),
      },
    });
  }
}
