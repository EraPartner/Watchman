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
import { ttlMemo, type TtlMemo } from "../../../core/ttlMemo.js";
import { createAuthGate, type AuthGate } from "../../../infra/http/authGate.js";
import type { AdGuardInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";

export interface AdGuardDeps {
  http: HttpClient;
  ping: PingProber;
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
  // present in AdGuard Home ≥ v0.107.30
  top_upstreams_responses?: Array<Record<string, number>>;
  top_upstreams_avg_time?: Array<Record<string, number>>;
}

interface FilteringStatus {
  enabled?: boolean;
  /** update interval in hours (AdGuard's filters_update_interval) */
  interval?: number;
  filters?: Array<{
    rules_count?: number;
    enabled?: boolean;
    name?: string;
    /** ISO time of the list's last successful download */
    last_updated?: string;
  }>;
  user_rules?: string[];
}

/** POST /control/version.json answer (AdGuard OpenAPI VersionInfo). */
interface VersionInfo {
  new_version?: string;
  announcement?: string;
  announcement_url?: string;
  can_autoupdate?: boolean;
  /** true when AdGuard's own update check is disabled */
  disabled?: boolean;
}

/** GET /control/tls/status; only the fields Watchman reports. Field names
 *  from the AdGuard OpenAPI TlsConfig schema (unverified on a live server). */
interface TlsStatus {
  enabled?: boolean;
  not_after?: string;
  valid_cert?: boolean;
  valid_chain?: boolean;
}

interface ClientsResponse {
  clients?: unknown[];
  auto_clients?: unknown[];
}

interface DhcpStatus {
  enabled?: boolean;
  leases?: unknown[];
  static_leases?: unknown[];
}

interface ToggleStatus {
  enabled?: boolean;
}

/** One /control/querylog entry; only the fields Watchman summarises. */
interface QueryLogEntry {
  client?: string;
  question?: { name?: string };
  reason?: string;
  elapsedMs?: string | number;
}

interface QueryLogResponse {
  data?: QueryLogEntry[];
}

/** Entries read per poll when the opt-in query log is on. */
export const QUERY_LOG_LIMIT = 100;

interface DnsInfo {
  upstream_dns?: string[];
  upstream_mode?: string;
}

// filter lists, clients, DHCP config, protection toggles and upstream config
// are configuration-grade — refresh every 10 minutes, not every stats poll
const CONFIG_LANE_TTL_MS = 10 * 60 * 1000;
// AdGuard refreshes its own update info every few hours; asking more often
// adds nothing
const UPDATE_LANE_TTL_MS = 6 * 60 * 60 * 1000;
// a filter list whose last download is older than this is reported stale
// (AdGuard's default update interval is 24 h)
export const STALE_FILTER_MS = 7 * 24 * 60 * 60 * 1000;

export class AdGuardService extends BaseService {
  readonly kind = "adguard";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly authHeader: string | undefined;
  private readonly timeoutMs: number;
  private readonly pinger: PingProber;
  private readonly pingHost: string;
  private readonly now: () => number;
  private readonly filteringMemo: TtlMemo<FilteringStatus>;
  private readonly clientsMemo: TtlMemo<ClientsResponse>;
  private readonly dhcpMemo: TtlMemo<DhcpStatus>;
  private readonly safebrowsingMemo: TtlMemo<ToggleStatus>;
  private readonly parentalMemo: TtlMemo<ToggleStatus>;
  private readonly safesearchMemo: TtlMemo<ToggleStatus>;
  private readonly dnsInfoMemo: TtlMemo<DnsInfo>;
  private readonly tlsMemo: TtlMemo<TlsStatus>;
  private readonly updateMemo: TtlMemo<VersionInfo> | undefined;
  private readonly authGate: AuthGate;
  private readonly readQueryLog: boolean;
  /** Admin credentials over plain http to another host: shown as a warning. */
  private readonly cleartextCredentials: boolean;

  constructor(deps: AdGuardDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    const url = new URL(deps.config.baseUrl);
    this.pingHost = url.hostname;
    this.readQueryLog = deps.config.readQueryLog;
    this.cleartextCredentials =
      url.protocol === "http:" &&
      Boolean(deps.config.username || deps.config.password) &&
      !isLoopbackHost(url.hostname);
    this.now = deps.now;
    if (deps.config.username || deps.config.password) {
      const token = Buffer.from(
        `${deps.config.username}:${deps.config.password}`
      ).toString("base64");
      this.authHeader = `Basic ${token}`;
    } else {
      this.authHeader = undefined;
    }
    const lane = <T>(path: string): TtlMemo<T> =>
      ttlMemo(CONFIG_LANE_TTL_MS, deps.now, (signal) =>
        this.get<T>(path, signal)
      );
    this.filteringMemo = lane<FilteringStatus>("/control/filtering/status");
    this.clientsMemo = lane<ClientsResponse>("/control/clients");
    this.dhcpMemo = lane<DhcpStatus>("/control/dhcp/status");
    this.safebrowsingMemo = lane<ToggleStatus>("/control/safebrowsing/status");
    this.parentalMemo = lane<ToggleStatus>("/control/parental/status");
    this.safesearchMemo = lane<ToggleStatus>("/control/safesearch/status");
    this.dnsInfoMemo = lane<DnsInfo>("/control/dns_info");
    this.tlsMemo = lane<TlsStatus>("/control/tls/status");
    this.authGate = createAuthGate({ now: deps.now, label: "adguard" });
    // Opt-in (checkUpdates), approved by the user on 2026-11-05: the only
    // POST Watchman sends to AdGuard. recheck_now:false returns AdGuard's
    // cached update info; it starts no download and changes no setting.
    this.updateMemo = deps.config.checkUpdates
      ? ttlMemo(UPDATE_LANE_TTL_MS, deps.now, (signal) =>
          this.request<VersionInfo>(
            "POST",
            "/control/version.json",
            signal,
            JSON.stringify({ recheck_now: false })
          )
        )
      : undefined;
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
        const status = await this.get<AdGuardStatus>("/control/status", sig);
        const latencyMs = this.now() - started;
        const running = Boolean(status.running);
        const protectionEnabled = Boolean(status.protection_enabled);
        const details: Record<string, unknown> = {
          version: status.version ?? "unknown",
          protectionEnabled,
        };
        if (!protectionEnabled)
          details["warning"] = "DNS protection is disabled";
        return { reachable: running, latencyMs, details };
      },
      this.now(),
      signal
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [
        status,
        stats,
        filtering,
        clients,
        dhcp,
        safebrowsing,
        parental,
        safesearch,
        dnsInfo,
        queryLog,
        tls,
        update,
      ] = await Promise.all([
        this.get<AdGuardStatus>("/control/status", signal),
        this.get<AdGuardStats>("/control/stats", signal),
        this.filteringMemo(signal).catch((): FilteringStatus | null => null),
        this.clientsMemo(signal).catch((): ClientsResponse | null => null),
        this.dhcpMemo(signal).catch((): DhcpStatus | null => null),
        this.safebrowsingMemo(signal).catch((): ToggleStatus | null => null),
        this.parentalMemo(signal).catch((): ToggleStatus | null => null),
        this.safesearchMemo(signal).catch((): ToggleStatus | null => null),
        this.dnsInfoMemo(signal).catch((): DnsInfo | null => null),
        this.readQueryLog
          ? this.get<QueryLogResponse>(
              `/control/querylog?limit=${QUERY_LOG_LIMIT}`,
              signal
            ).catch((): QueryLogResponse | null => null)
          : Promise.resolve(null),
        this.tlsMemo(signal).catch((): TlsStatus | null => null),
        this.updateMemo
          ? this.updateMemo(signal).catch((): VersionInfo | null => null)
          : Promise.resolve(null),
      ]);

      const totalQueries = stats.num_dns_queries ?? 0;
      // Safe-search hits are rewritten to the engine's safe endpoint and still
      // answered, so they are not blocks (AdGuard lists them separately as
      // "enforced safe search"); safebrowsing/parental hits are blocked.
      const blockedQueries =
        (stats.num_blocked_filtering ?? 0) +
        (stats.num_replaced_safebrowsing ?? 0) +
        (stats.num_replaced_parental ?? 0);
      const allowedQueries = totalQueries - blockedQueries;
      const blockingRate =
        totalQueries > 0
          ? Math.round((blockedQueries / totalQueries) * 10_000) / 100
          : 0;

      // Filtering: count only enabled filter lists toward totalRules
      const filterList = filtering?.filters ?? [];
      const filterCount = filterList.length;
      const totalRules = filterList
        .filter((f) => f.enabled !== false)
        .reduce((sum, f) => sum + (f.rules_count ?? 0), 0);
      const userRules = (filtering?.user_rules ?? []).length;
      const freshness = filterFreshness(filterList, this.now());

      return ok({
        at: this.now(),
        metrics: {
          version: status.version ?? "unknown",
          running: Boolean(status.running),
          protectionEnabled: Boolean(status.protection_enabled),
          dnsPort: status.dns_port ?? 0,
          httpPort: status.http_port ?? 0,
          totalQueries,
          blockedQueries,
          allowedQueries,
          blockingRate,
          // AdGuard reports seconds; the metric is documented in ms
          avgProcessingTime: secondsToMs(stats.avg_processing_time) ?? 0,
          topBlockedDomain: topKey(stats.top_blocked_domains),
          topQueriedDomain: topKey(stats.top_queried_domains),
          topClient: topKey(stats.top_clients),
          topUpstream: topKey(stats.top_upstreams_responses),
          topUpstreamAvgMs: topUpstreamAvgMs(stats),
          safebrowsingBlocked: stats.num_replaced_safebrowsing ?? 0,
          safesearchBlocked: stats.num_replaced_safesearch ?? 0,
          parentalBlocked: stats.num_replaced_parental ?? 0,
          filteringEnabled: filtering?.enabled ?? null,
          filterCount,
          totalRules,
          userRules,
          clientCount: (clients?.clients ?? []).length,
          autoClientCount: (clients?.auto_clients ?? []).length,
          dhcpEnabled: dhcp?.enabled ?? null,
          dhcpLeases: (dhcp?.leases ?? []).length,
          dhcpStaticLeases: (dhcp?.static_leases ?? []).length,
          safebrowsingEnabled: safebrowsing?.enabled ?? null,
          parentalEnabled: parental?.enabled ?? null,
          safesearchEnabled: safesearch?.enabled ?? null,
          upstreamCount: (dnsInfo?.upstream_dns ?? []).length,
          upstreamMode: dnsInfo?.upstream_mode ?? null,
          oldestFilterUpdate: freshness.oldest,
          staleFilterCount: filtering ? freshness.staleCount : null,
          staleFilters: freshness.staleNames,
          tlsEnabled: tls?.enabled ?? null,
          tlsCertNotAfter: parseTime(tls?.not_after),
          tlsCertValid:
            tls?.enabled && typeof tls.valid_cert === "boolean"
              ? tls.valid_cert && tls.valid_chain !== false
              : null,
          ...(update ? updateMetrics(update, status.version) : {}),
          cleartextCredentials: this.cleartextCredentials,
          ...(queryLog ? summarizeQueryLog(queryLog.data ?? []) : {}),
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`adguard stats failed: ${msg}`));
    }
  }

  private get<T>(path: string, signal: AbortSignal): Promise<T> {
    return this.request<T>("GET", path, signal);
  }

  /** Every AdGuard call goes through here. GET only, except the opt-in
   *  update check above. A refused password stops the requests (auth gate)
   *  so AdGuard's login lockout is never triggered by polling. */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    signal: AbortSignal,
    body?: string
  ): Promise<T> {
    this.authGate.check();
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.authHeader) headers["authorization"] = this.authHeader;
    const res = await this.http.send({
      url: `${this.baseUrl}${path}`,
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal,
      timeoutMs: this.timeoutMs,
    });
    return this.parse<T>(res, path);
  }

  private async parse<T>(res: HttpResponse, path: string): Promise<T> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        const error = new UnauthorizedError(
          `adguard ${path} returned ${res.status}: check the username and password`
        );
        this.authGate.reject(error);
        throw error;
      }
      throw new UnavailableError(
        `adguard ${path} returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    this.authGate.accept();
    return res.json<T>();
  }
}

function parseTime(value: string | undefined): number | null {
  if (typeof value !== "string" || value === "") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** Last-download times of the enabled filter lists. A list that never
 *  downloaded (no last_updated) counts as stale. */
export function filterFreshness(
  filters: NonNullable<FilteringStatus["filters"]>,
  now: number
): { oldest: number | null; staleCount: number; staleNames: string[] } {
  let oldest: number | null = null;
  const staleNames: string[] = [];
  for (const f of filters) {
    if (f.enabled === false) continue;
    const t = parseTime(f.last_updated);
    if (t !== null && (oldest === null || t < oldest)) oldest = t;
    if (t === null || now - t > STALE_FILTER_MS) {
      staleNames.push(f.name ?? "unnamed list");
    }
  }
  return { oldest, staleCount: staleNames.length, staleNames: staleNames.slice(0, 10) };
}

/** An empty new_version means AdGuard knows of no newer release. */
export function updateMetrics(
  info: VersionInfo,
  currentVersion: string | undefined
): {
  updateAvailable: boolean | null;
  latestVersion: string | null;
  updateCheckDisabled: boolean;
} {
  if (info.disabled) {
    return { updateAvailable: null, latestVersion: null, updateCheckDisabled: true };
  }
  const latest = typeof info.new_version === "string" ? info.new_version : "";
  return {
    updateAvailable: latest !== "" && latest !== currentVersion,
    latestVersion: latest !== "" ? latest : (currentVersion ?? null),
    updateCheckDisabled: false,
  };
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || host === "[::1]" || /^127\./.test(host);
}

/** Most frequent value, or null for an empty list. */
function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

/** Scalar summary of the latest query-log page. Blocked means a Filtered*
 *  reason other than safe search, matching blockedQueries above (safe-search
 *  hits are rewritten and still answered). */
export function summarizeQueryLog(entries: readonly QueryLogEntry[]): {
  queryLogSampleSize: number;
  queryLogBlocked: number;
  queryLogAvgMs: number | null;
  queryLogTopBlockedDomain: string | null;
  queryLogTopClient: string | null;
} {
  const blocked = entries.filter(
    (e) =>
      typeof e.reason === "string" &&
      e.reason.startsWith("Filtered") &&
      e.reason !== "FilteredSafeSearch"
  );
  const elapsed = entries
    .map((e) => Number(e.elapsedMs))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return {
    queryLogSampleSize: entries.length,
    queryLogBlocked: blocked.length,
    queryLogAvgMs:
      elapsed.length > 0
        ? Math.round((elapsed.reduce((a, b) => a + b, 0) / elapsed.length) * 100) / 100
        : null,
    queryLogTopBlockedDomain: mostCommon(
      blocked.map((e) => e.question?.name ?? "").filter((n) => n !== "")
    ),
    queryLogTopClient: mostCommon(
      entries.map((e) => e.client ?? "").filter((c) => c !== "")
    ),
  };
}

function topKey(arr: Array<Record<string, number>> | undefined): string {
  if (!arr || arr.length === 0) return "N/A";
  const first = arr[0];
  if (!first) return "N/A";
  const key = Object.keys(first)[0];
  return key ?? "N/A";
}

function secondsToMs(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 1000 * 100) / 100;
}

/** Average response time (seconds → ms) of the top upstream, when the
 *  AdGuard version reports it. */
function topUpstreamAvgMs(stats: AdGuardStats): number | null {
  const upstream = topKey(stats.top_upstreams_responses);
  if (upstream === "N/A") return null;
  for (const entry of stats.top_upstreams_avg_time ?? []) {
    const value = entry[upstream];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value * 1000 * 100) / 100;
    }
  }
  return null;
}
