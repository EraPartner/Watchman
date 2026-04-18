import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, NotFoundError, isDomainError } from '../../../core/errors.js';
import type { TorInstance } from '../../../config/services.js';

export interface TorDeps {
  http: HttpClient;
  config: TorInstance;
  now: () => number;
}

interface OnionooRelay {
  nickname: string;
  fingerprint: string;
  running: boolean;
  hibernating?: boolean;
  flags?: string[];
  country?: string;
  country_name?: string;
  city_name?: string;
  first_seen?: string;
  last_seen?: string;
  consensus_weight?: number;
  platform?: string;
  contact?: string;
  or_addresses?: string[];
  version?: string;
  observed_bandwidth?: number;
  bandwidth_burst?: number;
}

interface OnionooResponse {
  relays?: OnionooRelay[];
}

export class TorService extends BaseService {
  readonly kind = 'tor';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly relayNickname: string;
  private readonly onionooBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(deps: TorDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.relayNickname = deps.config.relayNickname;
    this.onionooBaseUrl = deps.config.onionooBaseUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.config.timeoutMs;
    this.now = deps.now;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    try {
      const relay = await this.searchRelay(signal);
      const latencyMs = this.now() - started;
      if (!relay) {
        return err(new NotFoundError(`tor relay "${this.relayNickname}" not found`));
      }
      const version = relay.version ?? relay.platform ?? 'unknown';
      const details: Record<string, unknown> = { version, running: relay.running };
      if (!relay.running) details['warning'] = 'relay is not running';
      else if (relay.hibernating) details['warning'] = 'relay is hibernating';
      return ok({
        reachable: Boolean(relay.running) && !relay.hibernating,
        latencyMs,
        at: this.now(),
        details,
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`tor unreachable: ${msg}`));
    }
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const relay = await this.searchRelay(signal);
      if (!relay) {
        return err(new NotFoundError(`tor relay "${this.relayNickname}" not found`));
      }
      return ok({
        at: this.now(),
        metrics: {
          nickname: relay.nickname,
          fingerprint: relay.fingerprint.slice(0, 8) + '...',
          running: Boolean(relay.running),
          hibernating: Boolean(relay.hibernating),
          flags: (relay.flags ?? []).join(','),
          country: relay.country_name ?? relay.country ?? 'Unknown',
          city: relay.city_name ?? 'Unknown',
          firstSeen: relay.first_seen ?? '',
          lastSeen: relay.last_seen ?? '',
          consensusWeight: relay.consensus_weight ?? 0,
          platform: relay.platform ?? 'Unknown',
          contact: relay.contact ?? '',
          orPort: extractORPort(relay.or_addresses),
          relayType: determineRelayType(relay.flags ?? []),
          version: relay.version ?? relay.platform ?? 'Unknown',
          bandwidthCurrent: relay.observed_bandwidth ?? 0,
          bandwidthBurst: relay.bandwidth_burst ?? 0,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`tor stats failed: ${msg}`));
    }
  }

  private async searchRelay(signal: AbortSignal): Promise<OnionooRelay | null> {
    const url = `${this.onionooBaseUrl}/details?search=${encodeURIComponent(this.relayNickname)}`;
    const res = await this.http.send({
      url,
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'Watchman-Dashboard/1.0',
      },
      signal,
      timeoutMs: this.timeoutMs,
    });
    const data = await this.parse(res);
    const relays = data.relays ?? [];
    if (relays.length === 0) return null;
    const nick = this.relayNickname.toLowerCase();
    return relays.find((r) => r.nickname.toLowerCase() === nick) ?? relays[0] ?? null;
  }

  private async parse(res: HttpResponse): Promise<OnionooResponse> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '');
      throw new UnavailableError(`onionoo returned ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json<OnionooResponse>();
  }
}

function extractORPort(addresses: string[] | undefined): number {
  if (!addresses) return 9001;
  for (const addr of addresses) {
    const m = addr.match(/:(\d+)$/);
    if (m && m[1]) return parseInt(m[1], 10);
  }
  return 9001;
}

function determineRelayType(flags: string[]): string {
  if (flags.includes('Exit')) return 'exit';
  if (flags.includes('Guard')) return 'guard';
  if (flags.includes('Bridge')) return 'bridge';
  return 'relay';
}
