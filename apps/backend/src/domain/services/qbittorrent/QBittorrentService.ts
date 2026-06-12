import {
  BaseService,
  type HealthResult,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { withHostPing } from "../../health.js";
import type { HttpClient, HttpResponse } from "../../../infra/http/client.js";
import { ok, err } from "../../../core/result.js";
import {
  UnauthorizedError,
  UnavailableError,
  isDomainError,
} from "../../../core/errors.js";
import type { QbittorrentInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import { ttlMemo, type TtlMemo } from "../../../core/ttlMemo.js";

export interface QbittorrentDeps {
  http: HttpClient;
  ping: PingProber;
  config: QbittorrentInstance;
  now: () => number;
}

interface Torrent {
  name?: string;
  state?: string;
  progress?: number;
  dlspeed?: number;
  upspeed?: number;
  size?: number;
  downloaded?: number;
  uploaded?: number;
  eta?: number;
  category?: string;
}

interface ServerState {
  uptime?: number;
  connection_status?: string;
  dht_nodes?: number;
  free_space_on_disk?: number;
  dl_info_speed?: number;
  up_info_speed?: number;
  dl_info_data?: number;
  up_info_data?: number;
}

interface MainData {
  rid?: number;
  full_update?: boolean;
  server_state?: ServerState;
  torrents?: Record<string, Torrent>;
  torrents_removed?: string[];
}

interface Preferences {
  listen_port?: number;
}

interface LogEntry {
  id?: number;
  message?: string;
  timestamp?: number;
  type?: number; // 1=normal 2=info 4=warning 8=critical
}

const COOKIE_TTL_MS = 60 * 60 * 1000;
const MAX_ACTIVE_TORRENTS = 20;
// app version and preferences are configuration-grade — refresh hourly, not per poll
const STATIC_INFO_TTL_MS = 60 * 60 * 1000;

export class QBittorrentService extends BaseService {
  readonly kind = "qbittorrent";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly pinger: PingProber;
  private readonly pingHost: string;
  private readonly now: () => number;
  private cookie: string | null = null;
  private cookieExpiresAt = 0;
  private rid = 0;
  private lastLogId = -1;
  private cachedServerState: ServerState = {};
  private cachedTorrents: Record<string, Torrent> = {};
  private readonly versionMemo: TtlMemo<string>;
  private readonly prefsMemo: TtlMemo<Preferences>;

  constructor(deps: QbittorrentDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.baseUrl.replace(/\/+$/, "");
    this.username = deps.config.username;
    this.password = deps.config.password;
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    this.pingHost = new URL(deps.config.baseUrl).hostname;
    this.now = deps.now;
    this.versionMemo = ttlMemo(STATIC_INFO_TTL_MS, deps.now, (signal) =>
      this.apiGet<string>("/api/v2/app/version", signal)
    );
    this.prefsMemo = ttlMemo(STATIC_INFO_TTL_MS, deps.now, (signal) =>
      this.apiGet<Preferences>("/api/v2/app/preferences", signal)
    );
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    return withHostPing(
      {
        host: this.pingHost,
        timeoutMs: this.timeoutMs,
        pingCount: 1,
        prober: this.pinger,
      },
      async (sig) => {
        const started = this.now();
        await this.apiGet<string>("/api/v2/app/version", sig);
        return { reachable: true, latencyMs: this.now() - started };
      },
      this.now(),
      signal
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      // steady state is two requests: the incremental maindata sync and the
      // log cursor; version/preferences refresh hourly via TTL memo, and
      // transfer data comes from maindata's server_state
      const [version, preferences, mainData, logEntries] = await Promise.all([
        this.versionMemo(signal),
        this.prefsMemo(signal),
        this.apiGet<MainData>(`/api/v2/sync/maindata?rid=${this.rid}`, signal),
        this.apiGet<LogEntry[]>(
          `/api/v2/log/main?type=12&last_known_id=${this.lastLogId}`,
          signal
        ).catch((): LogEntry[] => []),
      ]);

      // Update rid for next incremental call
      if (typeof mainData.rid === "number") this.rid = mainData.rid;

      // Merge server state and torrents (full_update replaces; delta merges).
      // Deltas carry only changed fields per torrent, so merge field-wise —
      // replacing the object would drop unchanged fields like name/state.
      if (mainData.full_update) {
        this.cachedServerState = mainData.server_state ?? {};
        this.cachedTorrents = mainData.torrents ?? {};
      } else {
        if (mainData.server_state) {
          this.cachedServerState = {
            ...this.cachedServerState,
            ...mainData.server_state,
          };
        }
        if (mainData.torrents) {
          for (const [hash, patch] of Object.entries(mainData.torrents)) {
            this.cachedTorrents[hash] = {
              ...this.cachedTorrents[hash],
              ...patch,
            };
          }
        }
        if (mainData.torrents_removed) {
          const removedSet = new Set(mainData.torrents_removed);
          this.cachedTorrents = Object.fromEntries(
            Object.entries(this.cachedTorrents).filter(
              ([hash]) => !removedSet.has(hash)
            )
          );
        }
      }

      // Update lastLogId from new entries
      const logs = Array.isArray(logEntries) ? logEntries : [];
      for (const entry of logs) {
        if (typeof entry.id === "number" && entry.id > this.lastLogId) {
          this.lastLogId = entry.id;
        }
      }

      // Count torrent states from cached map
      const torrents = this.cachedTorrents;
      let downloading = 0;
      let seeding = 0;
      let paused = 0;
      let completed = 0;
      let errored = 0;
      for (const t of Object.values(torrents)) {
        const state = t.state;
        if (state === "downloading") downloading++;
        if (state === "uploading") {
          seeding++;
          completed++;
        }
        if (state === "pausedDL" || state === "pausedUP") paused++;
        if (state === "stalledUP") completed++;
        if (
          state === "error" ||
          state === "missingFiles" ||
          state === "unknownError"
        )
          errored++;
      }

      // Per-torrent detail: top MAX_ACTIVE_TORRENTS by combined dl+ul speed,
      // derived from the incrementally-synced maindata cache instead of
      // re-fetching the full torrent list every poll.
      const activeTorrents = Object.entries(torrents)
        .map(([hash, t]) => ({ hash, ...t }))
        .filter((t) => (t.dlspeed ?? 0) + (t.upspeed ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.dlspeed ?? 0) +
            (b.upspeed ?? 0) -
            ((a.dlspeed ?? 0) + (a.upspeed ?? 0))
        )
        .slice(0, MAX_ACTIVE_TORRENTS);

      // Split log entries by severity
      const recentWarnings: string[] = [];
      const recentErrors: string[] = [];
      for (const entry of logs) {
        if (!entry.message) continue;
        if (entry.type === 8) recentErrors.push(entry.message);
        else if (entry.type === 4) recentWarnings.push(entry.message);
      }

      const serverState = this.cachedServerState;

      return ok({
        at: this.now(),
        metrics: {
          version: typeof version === "string" ? version : "unknown",
          uptime: serverState.uptime ?? 0,
          torrentsTotal: Object.keys(torrents).length,
          torrentsDownloading: downloading,
          torrentsSeeding: seeding,
          torrentsPaused: paused,
          torrentsCompleted: completed,
          torrentsError: errored,
          dlSpeed: serverState.dl_info_speed ?? 0,
          upSpeed: serverState.up_info_speed ?? 0,
          dlData: serverState.dl_info_data ?? 0,
          upData: serverState.up_info_data ?? 0,
          connectionStatus: serverState.connection_status ?? "disconnected",
          listenPort: preferences.listen_port ?? 0,
          dhtNodes: serverState.dht_nodes ?? 0,
          freeSpaceOnDisk: serverState.free_space_on_disk ?? 0,
          activeTorrents,
          recentErrors,
          recentWarnings,
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

  private async request(
    path: string,
    signal: AbortSignal
  ): Promise<HttpResponse> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers["cookie"] = this.cookie;
    return this.http.send({
      url: `${this.baseUrl}${path}`,
      method: "GET",
      headers,
      signal,
      timeoutMs: this.timeoutMs,
    });
  }

  private async ensureAuth(signal: AbortSignal): Promise<void> {
    if (this.cookie && this.now() < this.cookieExpiresAt) return;
    const form = new URLSearchParams({
      username: this.username,
      password: this.password,
    }).toString();
    const res = await this.http.send({
      url: `${this.baseUrl}/api/v2/auth/login`,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal,
      timeoutMs: this.timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new UnauthorizedError(`qbittorrent auth returned ${res.status}`);
    }
    const setCookie = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (!cookieStr)
      throw new UnauthorizedError("qbittorrent login missing set-cookie");
    const first = cookieStr.split(";")[0];
    if (!first)
      throw new UnauthorizedError("qbittorrent login cookie malformed");
    this.cookie = first;
    this.cookieExpiresAt = this.now() + COOKIE_TTL_MS;
  }

  private async parse<T>(res: HttpResponse, path: string): Promise<T> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      throw new UnavailableError(
        `qbittorrent ${path} returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    const text = await res.text();
    if (!text || text.trim() === "") return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text.replace(/^"|"$/g, "") as unknown as T;
    }
  }
}
