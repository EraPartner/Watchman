import { BaseService, type HealthResult, type HostHealth, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { ok } from '../../../core/result.js';
import type { PhilipsBridgeInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { HttpClient } from '../../../infra/http/client.js';
import { createPinnedClient } from '../../../infra/http/pinnedClient.js';

const HUE_API_BASE = '/clip/v2';

interface HueLight {
  id: string;
  type: string;
  on?: { on: boolean };
  metadata?: { name?: string };
}

interface HueLightsResponse {
  errors?: unknown[];
  data?: HueLight[];
}

export interface PhilipsBridgeDeps {
  ping: PingProber;
  http: HttpClient;
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
  private readonly applicationKey: string | undefined;
  private readonly pinger: PingProber;
  private readonly http: HttpClient;
  private readonly now: () => number;

  constructor(deps: PhilipsBridgeDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.applicationKey = deps.config.applicationKey;
    this.now = deps.now;
    this.pinger = deps.ping;
    this.http = deps.config.certHash
      ? createPinnedClient(deps.http, deps.config.certHash)
      : deps.http;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const pingRes = await this.pinger.probe({
      host: this.host,
      timeoutMs: this.timeoutMs,
      count: this.pingCount,
      signal,
    });
    const latencyMs = pingRes.avgMs ?? this.now() - started;
    const host: HostHealth = {
      reachable: pingRes.success,
      ...(pingRes.avgMs !== undefined ? { pingMs: pingRes.avgMs } : {}),
    };

    if (!this.applicationKey) {
      return ok({
        reachable: pingRes.success,
        latencyMs,
        at: this.now(),
        host,
        details: { host: this.host, icmpAlive: pingRes.success },
      });
    }

    const apiReachable = await this.probeApi(signal);
    const service = { reachable: apiReachable, details: { apiV2: true } };
    const reachable = host.reachable || service.reachable;

    return ok({
      reachable,
      latencyMs,
      at: this.now(),
      host,
      service,
      details: { host: this.host, icmpAlive: pingRes.success, apiReachable },
    });
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    const base = { host: this.host, configured: Boolean(this.host) };

    if (!this.applicationKey) {
      return ok({ at: this.now(), metrics: base });
    }

    const lightMetrics = await this.fetchLightMetrics(signal);
    return ok({ at: this.now(), metrics: { ...base, ...lightMetrics } });
  }

  private apiUrl(path: string): string {
    return `https://${this.host}${HUE_API_BASE}${path}`;
  }

  private apiHeaders(): Record<string, string> {
    return { 'hue-application-key': this.applicationKey! };
  }

  private async probeApi(signal: AbortSignal): Promise<boolean> {
    try {
      const res = await this.http.send({
        url: this.apiUrl('/resource/light'),
        method: 'GET',
        headers: this.apiHeaders(),
        timeoutMs: this.timeoutMs,
        signal,
      });
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  }

  private async fetchLightMetrics(signal: AbortSignal): Promise<Record<string, unknown>> {
    try {
      const res = await this.http.send({
        url: this.apiUrl('/resource/light'),
        method: 'GET',
        headers: this.apiHeaders(),
        timeoutMs: this.timeoutMs,
        signal,
      });
      if (res.status < 200 || res.status >= 300) return {};
      const body = await res.json<HueLightsResponse>();
      const lights = body.data ?? [];
      const lightCount = lights.length;
      const onCount = lights.filter((l) => l.on?.on === true).length;
      const offCount = lightCount - onCount;
      return { lightCount, onCount, offCount };
    } catch {
      return {};
    }
  }
}
