import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { withHostPing } from '../../health.js';
import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, isDomainError } from '../../../core/errors.js';
import type { AlbyHubInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';

export interface AlbyHubDeps {
  http: HttpClient;
  ping: PingProber;
  config: AlbyHubInstance;
  now: () => number;
}

// Legacy probe paths — used when legacyProbe: true (default, backward-compatible)
const PROBE_PATHS = ['/api', '/api/info', '/api/v1/info', '/info', '/status', '/health', '/'] as const;
const INFO_PATHS = [
  '/api/v1/info',
  '/api/info',
  '/api/getInfo',
  '/api/v1/getInfo',
  '/info',
  '/getInfo',
  '/api/v1',
  '/api',
  '/status',
  '/health',
  '/',
] as const;

interface InfoPayload {
  name?: string;
  title?: string;
  service?: string;
  version?: string;
  app_version?: string;
  api_version?: string;
  description?: string;
  info?: string;
  data?: InfoPayload;
}

interface ResolvedInfo {
  name: string;
  version: string | null;
  description: string | null;
  endpoint: string;
}

// Alby Hub NWC API response shapes (used when legacyProbe: false)
interface NwcInfo {
  backendType?: string;
  setupCompleted?: boolean;
  connected?: boolean;
  version?: string;
  name?: string;
}

interface NwcApp {
  id?: number;
  name?: string;
}

const NWC_INFO_PATH = '/api/info';
const NWC_APPS_PATH = '/api/apps';

export class AlbyHubService extends BaseService {
  readonly kind = 'albyHub';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly authHeader: string | undefined;
  private readonly timeoutMs: number;
  private readonly pinger: PingProber;
  private readonly pingHost: string;
  private readonly now: () => number;
  private readonly legacyProbe: boolean;

  constructor(deps: AlbyHubDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    this.pingHost = new URL(deps.config.baseUrl).hostname;
    this.now = deps.now;
    this.authHeader = deps.config.token ? `Bearer ${deps.config.token}` : undefined;
    this.legacyProbe = deps.config.legacyProbe;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    return withHostPing(
      { host: this.pingHost, timeoutMs: this.timeoutMs, pingCount: 1, prober: this.pinger },
      async (sig) => {
        if (!this.legacyProbe) {
          return this.checkHealthNwc(sig);
        }
        const started = this.now();
        const probe = await this.probe(sig);
        if (!probe) {
          return { reachable: false, message: 'albyHub: no reachable endpoints' };
        }
        const latencyMs = this.now() - started;
        return {
          reachable: probe.status >= 200 && probe.status < 400,
          latencyMs,
          details: { endpoint: probe.path, statusCode: probe.status },
        };
      },
      this.now(),
      signal,
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      if (!this.legacyProbe) {
        return this.getStatsNwc(signal);
      }
      const info = await this.resolveInfo(signal);
      const endpoint = info?.endpoint ?? (await this.probe(signal))?.path ?? null;
      const url = endpoint ? `${this.baseUrl}${endpoint}` : '';
      return ok({
        at: this.now(),
        metrics: {
          name: info?.name ?? 'Alby Hub',
          version: info?.version ?? 'unknown',
          description: info?.description ?? '',
          endpoint: endpoint ?? '',
          url,
          reachable: info !== null,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`albyHub stats failed: ${msg}`));
    }
  }

  // NWC deterministic health check: GET /api/info
  private async checkHealthNwc(signal: AbortSignal): Promise<{ reachable: boolean; latencyMs?: number; details?: Record<string, unknown>; message?: string }> {
    const started = this.now();
    const res = await this.tryGet(NWC_INFO_PATH, signal);
    if (!res || res.status < 200 || res.status >= 300) {
      return { reachable: false, message: `albyHub: ${NWC_INFO_PATH} returned ${res?.status ?? 'no response'}` };
    }
    const payload = await this.parseJson(res) as NwcInfo | null;
    const latencyMs = this.now() - started;
    return {
      reachable: true,
      latencyMs,
      details: {
        endpoint: NWC_INFO_PATH,
        connected: payload?.connected ?? null,
        version: payload?.version ?? 'unknown',
      },
    };
  }

  // NWC deterministic stats: GET /api/info + GET /api/apps
  private async getStatsNwc(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [infoRes, appsRes] = await Promise.all([
        this.tryGet(NWC_INFO_PATH, signal),
        this.tryGet(NWC_APPS_PATH, signal).catch((): HttpResponse | null => null),
      ]);

      const reachable = infoRes !== null && infoRes.status >= 200 && infoRes.status < 300;
      const info = reachable && infoRes ? ((await this.parseJson(infoRes)) as NwcInfo | null) : null;

      let appCount: number | null = null;
      if (appsRes && appsRes.status >= 200 && appsRes.status < 300) {
        const appsPayload = await this.parseJson(appsRes);
        if (Array.isArray(appsPayload)) {
          appCount = (appsPayload as NwcApp[]).length;
        }
      }

      return ok({
        at: this.now(),
        metrics: {
          name: info?.name ?? 'Alby Hub',
          version: info?.version ?? 'unknown',
          description: '',
          endpoint: NWC_INFO_PATH,
          url: `${this.baseUrl}${NWC_INFO_PATH}`,
          reachable,
          connected: info?.connected ?? null,
          setupCompleted: info?.setupCompleted ?? null,
          backendType: info?.backendType ?? null,
          appCount,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`albyHub NWC stats failed: ${msg}`));
    }
  }

  private async probe(signal: AbortSignal): Promise<{ path: string; status: number } | null> {
    let fallback: { path: string; status: number } | null = null;
    for (const path of PROBE_PATHS) {
      const res = await this.tryGet(path, signal);
      if (!res) continue;
      if (res.status >= 200 && res.status < 400) return { path, status: res.status };
      if (!fallback) fallback = { path, status: res.status };
    }
    return fallback;
  }

  private async resolveInfo(signal: AbortSignal): Promise<ResolvedInfo | null> {
    for (const path of INFO_PATHS) {
      const res = await this.tryGet(path, signal);
      if (!res || res.status < 200 || res.status >= 300) continue;
      const payload = await this.parseJson(res);
      if (!payload || typeof payload !== 'object') continue;
      const body = (payload as InfoPayload).data ?? (payload as InfoPayload);
      return {
        name: body.name ?? body.title ?? body.service ?? 'Alby Hub',
        version: body.version ?? body.app_version ?? body.api_version ?? null,
        description: body.description ?? body.info ?? null,
        endpoint: path,
      };
    }
    return null;
  }

  private async tryGet(path: string, signal: AbortSignal): Promise<HttpResponse | null> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.authHeader) headers['authorization'] = this.authHeader;
    try {
      return await this.http.send({
        url: `${this.baseUrl}${path}`,
        method: 'GET',
        headers,
        signal,
        timeoutMs: this.timeoutMs,
      });
    } catch {
      return null;
    }
  }

  private async parseJson(res: HttpResponse): Promise<unknown> {
    try {
      const text = await res.text();
      if (!text || text.trim() === '') return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
