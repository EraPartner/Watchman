import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnauthorizedError, UnavailableError, isDomainError } from '../../../core/errors.js';
import type { QbittorrentInstance } from '../../../config/services.js';

export interface QbittorrentDeps {
  http: HttpClient;
  config: QbittorrentInstance;
  now: () => number;
}

interface TransferInfo {
  dl_info_speed?: number;
  up_info_speed?: number;
  dl_info_data?: number;
  up_info_data?: number;
}

interface Torrent {
  state?: string;
}

interface MainData {
  server_state?: {
    uptime?: number;
    connection_status?: string;
    dht_nodes?: number;
    free_space_on_disk?: number;
  };
  torrents?: Record<string, Torrent>;
}

interface Preferences {
  listen_port?: number;
}

const COOKIE_TTL_MS = 60 * 60 * 1000;

export class QBittorrentService extends BaseService {
  readonly kind = 'qbittorrent';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private cookie: string | null = null;
  private cookieExpiresAt = 0;

  constructor(deps: QbittorrentDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.baseUrl.replace(/\/+$/, '');
    this.username = deps.config.username;
    this.password = deps.config.password;
    this.timeoutMs = deps.config.timeoutMs;
    this.now = deps.now;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    try {
      await this.apiGet<string>('/api/v2/app/version', signal);
      return ok({
        reachable: true,
        latencyMs: this.now() - started,
        at: this.now(),
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`qbittorrent unreachable: ${msg}`));
    }
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [version, preferences, mainData, transferInfo] = await Promise.all([
        this.apiGet<string>('/api/v2/app/version', signal),
        this.apiGet<Preferences>('/api/v2/app/preferences', signal),
        this.apiGet<MainData>('/api/v2/sync/maindata', signal),
        this.apiGet<TransferInfo>('/api/v2/transfer/info', signal),
      ]);

      const serverState = mainData.server_state ?? {};
      const torrents = mainData.torrents ?? {};
      let downloading = 0;
      let seeding = 0;
      let paused = 0;
      let completed = 0;
      for (const t of Object.values(torrents)) {
        const state = t.state;
        if (state === 'downloading') downloading++;
        if (state === 'uploading') {
          seeding++;
          completed++;
        }
        if (state === 'pausedDL' || state === 'pausedUP') paused++;
        if (state === 'stalledUP') completed++;
      }

      return ok({
        at: this.now(),
        metrics: {
          version: typeof version === 'string' ? version : 'unknown',
          uptime: serverState.uptime ?? 0,
          torrentsTotal: Object.keys(torrents).length,
          torrentsDownloading: downloading,
          torrentsSeeding: seeding,
          torrentsPaused: paused,
          torrentsCompleted: completed,
          dlSpeed: transferInfo.dl_info_speed ?? 0,
          upSpeed: transferInfo.up_info_speed ?? 0,
          dlData: transferInfo.dl_info_data ?? 0,
          upData: transferInfo.up_info_data ?? 0,
          connectionStatus: serverState.connection_status ?? 'disconnected',
          listenPort: preferences.listen_port ?? 0,
          dhtNodes: serverState.dht_nodes ?? 0,
          freeSpaceOnDisk: serverState.free_space_on_disk ?? 0,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`qbittorrent stats failed: ${msg}`));
    }
  }

  private async apiGet<T>(path: string, signal: AbortSignal): Promise<T> {
    await this.ensureAuth(signal);
    let res = await this.request(path, signal);
    if (res.status === 403) {
      this.cookie = null;
      await this.ensureAuth(signal);
      res = await this.request(path, signal);
    }
    return this.parse<T>(res, path);
  }

  private async request(path: string, signal: AbortSignal): Promise<HttpResponse> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers['cookie'] = this.cookie;
    return this.http.send({
      url: `${this.baseUrl}${path}`,
      method: 'GET',
      headers,
      signal,
      timeoutMs: this.timeoutMs,
    });
  }

  private async ensureAuth(signal: AbortSignal): Promise<void> {
    if (this.cookie && this.now() < this.cookieExpiresAt) return;
    const form = new URLSearchParams({ username: this.username, password: this.password }).toString();
    const res = await this.http.send({
      url: `${this.baseUrl}/api/v2/auth/login`,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal,
      timeoutMs: this.timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new UnauthorizedError(`qbittorrent auth returned ${res.status}`);
    }
    const setCookie = res.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (!cookieStr) throw new UnauthorizedError('qbittorrent login missing set-cookie');
    const first = cookieStr.split(';')[0];
    if (!first) throw new UnauthorizedError('qbittorrent login cookie malformed');
    this.cookie = first;
    this.cookieExpiresAt = this.now() + COOKIE_TTL_MS;
  }

  private async parse<T>(res: HttpResponse, path: string): Promise<T> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '');
      throw new UnavailableError(`qbittorrent ${path} returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const text = await res.text();
    if (!text || text.trim() === '') return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text.replace(/^"|"$/g, '') as unknown as T;
    }
  }
}
