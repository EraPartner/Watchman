import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, isDomainError } from '../../../core/errors.js';
import type { AlbyHubInstance } from '../../../config/services.js';

export interface AlbyHubDeps {
  http: HttpClient;
  config: AlbyHubInstance;
  now: () => number;
}

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

export class AlbyHubService extends BaseService {
  readonly kind = 'albyHub';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly authHeader: string | undefined;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(deps: AlbyHubDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.config.timeoutMs;
    this.now = deps.now;
    this.authHeader = deps.config.token ? `Bearer ${deps.config.token}` : undefined;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const probe = await this.probe(signal);
    if (!probe) {
      return err(new UnavailableError('albyHub: no reachable endpoints'));
    }
    const latencyMs = this.now() - started;
    return ok({
      reachable: probe.status >= 200 && probe.status < 400,
      latencyMs,
      at: this.now(),
      details: { endpoint: probe.path, statusCode: probe.status },
    });
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
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
