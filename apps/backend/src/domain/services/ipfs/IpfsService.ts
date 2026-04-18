import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import type { HttpClient } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, TimeoutError, isDomainError } from '../../../core/errors.js';
import type { IpfsInstance } from '../../../config/services.js';

export interface IpfsDeps {
  http: HttpClient;
  config: IpfsInstance;
  now: () => number;
}

export class IpfsService extends BaseService {
  readonly kind = 'ipfs';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly forcePost: boolean;
  private readonly now: () => number;

  constructor(deps: IpfsDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.apiUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.config.timeoutMs;
    this.forcePost = deps.config.forcePost;
    this.now = deps.now;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const res = await this.fetchVersion(signal);
    if (!res.ok) return err(res.error);
    const latencyMs = this.now() - started;
    return ok({
      reachable: true,
      latencyMs,
      at: this.now(),
      details: { version: res.value },
    });
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [version, id, peers, repo, bw] = await Promise.all([
        this.post<{ Version?: string }>('/api/v0/version', signal),
        this.call<{ ID?: string; Addresses?: string[] }>('/api/v0/id', signal),
        this.call<{ Peers?: unknown[] } | unknown[]>('/api/v0/swarm/peers?format=json', signal).catch(() => null),
        this.call<{ RepoSize?: number; NumObjects?: number }>('/api/v0/repo/stat?format=json', signal).catch(() => null),
        this.call<{ TotalIn?: number; TotalOut?: number; RateIn?: number; RateOut?: number }>(
          '/api/v0/stats/bw?format=json',
          signal,
        ).catch(() => null),
      ]);

      const peersCount = Array.isArray(peers)
        ? peers.length
        : peers && Array.isArray((peers as { Peers?: unknown[] }).Peers)
          ? (peers as { Peers: unknown[] }).Peers.length
          : 0;

      return ok({
        at: this.now(),
        metrics: {
          version: version.Version ?? 'unknown',
          nodeId: id.ID ?? null,
          addressCount: id.Addresses?.length ?? 0,
          peers: peersCount,
          repoSize: repo?.RepoSize ?? null,
          numObjects: repo?.NumObjects ?? null,
          bwTotalIn: bw?.TotalIn ?? null,
          bwTotalOut: bw?.TotalOut ?? null,
          bwRateIn: bw?.RateIn ?? null,
          bwRateOut: bw?.RateOut ?? null,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      if (e instanceof Error) return err(new UnavailableError(`ipfs stats failed: ${e.message}`));
      return err(new UnavailableError('ipfs stats failed'));
    }
  }

  private async fetchVersion(signal: AbortSignal) {
    try {
      const body = await this.post<{ Version?: string; version?: string }>('/api/v0/version', signal);
      return ok(body.Version ?? body.version ?? 'unknown');
    } catch (e) {
      if (e instanceof TimeoutError) return err(e);
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`ipfs unreachable: ${msg}`));
    }
  }

  private async call<T>(path: string, signal: AbortSignal): Promise<T> {
    return this.forcePost ? this.post<T>(path, signal) : this.get<T>(path, signal);
  }

  private async get<T>(path: string, signal: AbortSignal): Promise<T> {
    const res = await this.http.send({
      url: `${this.baseUrl}${path}`,
      method: 'GET',
      signal,
      timeoutMs: this.timeoutMs,
    });
    if (res.status === 405) return this.post<T>(path, signal);
    return this.parse<T>(res, path);
  }

  private async post<T>(path: string, signal: AbortSignal): Promise<T> {
    const res = await this.http.send({
      url: `${this.baseUrl}${path}`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
      signal,
      timeoutMs: this.timeoutMs,
    });
    return this.parse<T>(res, path);
  }

  private async parse<T>(res: { status: number; text: () => Promise<string> }, path: string): Promise<T> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '');
      throw new UnavailableError(`ipfs ${path} returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
}
