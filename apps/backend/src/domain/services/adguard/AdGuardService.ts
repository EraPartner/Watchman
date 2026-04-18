import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, isDomainError } from '../../../core/errors.js';
import type { AdGuardInstance } from '../../../config/services.js';

export interface AdGuardDeps {
  http: HttpClient;
  config: AdGuardInstance;
  now: () => number;
}

interface AdGuardStatus {
  running?: boolean;
  version?: string;
  protection_enabled?: boolean;
  dns_port?: number;
  http_port?: number;
  language?: string;
  dhcp_available?: boolean;
  new_version?: string;
}

interface AdGuardStats {
  num_dns_queries?: number;
  num_blocked_filtering?: number;
  num_replaced_safebrowsing?: number;
  num_replaced_safesearch?: number;
  num_replaced_parental?: number;
  avg_processing_time?: number;
  time_units?: string;
  top_blocked_domains?: Array<Record<string, number>>;
  top_queried_domains?: Array<Record<string, number>>;
  top_clients?: Array<Record<string, number>>;
}

export class AdGuardService extends BaseService {
  readonly kind = 'adguard';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly authHeader: string | undefined;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(deps: AdGuardDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.config.timeoutMs;
    this.now = deps.now;
    if (deps.config.username || deps.config.password) {
      const token = Buffer.from(`${deps.config.username}:${deps.config.password}`).toString('base64');
      this.authHeader = `Basic ${token}`;
    } else {
      this.authHeader = undefined;
    }
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    try {
      const status = await this.get<AdGuardStatus>('/control/status', signal);
      const latencyMs = this.now() - started;
      const running = Boolean(status.running);
      const protectionEnabled = Boolean(status.protection_enabled);
      const reachable = running;
      const details: Record<string, unknown> = {
        version: status.version ?? 'unknown',
        protectionEnabled,
      };
      if (!protectionEnabled) details['warning'] = 'DNS protection is disabled';
      return ok({ reachable, latencyMs, at: this.now(), details });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`adguard unreachable: ${msg}`));
    }
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [status, stats] = await Promise.all([
        this.get<AdGuardStatus>('/control/status', signal),
        this.get<AdGuardStats>('/control/stats', signal),
      ]);
      const totalQueries = stats.num_dns_queries ?? 0;
      const blockedQueries =
        (stats.num_blocked_filtering ?? 0) +
        (stats.num_replaced_safebrowsing ?? 0) +
        (stats.num_replaced_safesearch ?? 0) +
        (stats.num_replaced_parental ?? 0);
      const allowedQueries = totalQueries - blockedQueries;
      const blockingRate = totalQueries > 0 ? Math.round((blockedQueries / totalQueries) * 10_000) / 100 : 0;

      return ok({
        at: this.now(),
        metrics: {
          version: status.version ?? 'unknown',
          running: Boolean(status.running),
          protectionEnabled: Boolean(status.protection_enabled),
          dnsPort: status.dns_port ?? 0,
          httpPort: status.http_port ?? 0,
          totalQueries,
          blockedQueries,
          allowedQueries,
          blockingRate,
          avgProcessingTime: stats.avg_processing_time ?? 0,
          topBlockedDomain: topKey(stats.top_blocked_domains),
          topQueriedDomain: topKey(stats.top_queried_domains),
          topClient: topKey(stats.top_clients),
          safebrowsingBlocked: stats.num_replaced_safebrowsing ?? 0,
          safesearchBlocked: stats.num_replaced_safesearch ?? 0,
          parentalBlocked: stats.num_replaced_parental ?? 0,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`adguard stats failed: ${msg}`));
    }
  }

  private async get<T>(path: string, signal: AbortSignal): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.authHeader) headers['authorization'] = this.authHeader;
    const res = await this.http.send({
      url: `${this.baseUrl}${path}`,
      method: 'GET',
      headers,
      signal,
      timeoutMs: this.timeoutMs,
    });
    return this.parse<T>(res, path);
  }

  private async parse<T>(res: HttpResponse, path: string): Promise<T> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '');
      throw new UnavailableError(`adguard ${path} returned ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json<T>();
  }
}

function topKey(arr: Array<Record<string, number>> | undefined): string {
  if (!arr || arr.length === 0) return 'N/A';
  const first = arr[0];
  if (!first) return 'N/A';
  const key = Object.keys(first)[0];
  return key ?? 'N/A';
}
