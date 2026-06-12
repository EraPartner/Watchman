import {
  BaseService,
  type HealthResult,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { withHostPing } from "../../health.js";
import type { HttpClient, HttpResponse } from "../../../infra/http/client.js";
import { ok, err } from "../../../core/result.js";
import { UnavailableError, isDomainError } from "../../../core/errors.js";
import { ttlMemo, type TtlMemo } from "../../../core/ttlMemo.js";
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
  filters?: Array<{ rules_count?: number; enabled?: boolean }>;
  user_rules?: string[];
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

interface DnsInfo {
  upstream_dns?: string[];
  upstream_mode?: string;
}

// filter lists, clients, DHCP config, protection toggles and upstream config
// are configuration-grade — refresh every 10 minutes, not every stats poll
const CONFIG_LANE_TTL_MS = 10 * 60 * 1000;

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

  constructor(deps: AdGuardDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    this.pingHost = new URL(deps.config.baseUrl).hostname;
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
      ]);

      const totalQueries = stats.num_dns_queries ?? 0;
      const blockedQueries =
        (stats.num_blocked_filtering ?? 0) +
        (stats.num_replaced_safebrowsing ?? 0) +
        (stats.num_replaced_safesearch ?? 0) +
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
          avgProcessingTime: stats.avg_processing_time ?? 0,
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
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`adguard stats failed: ${msg}`));
    }
  }

  private async get<T>(path: string, signal: AbortSignal): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.authHeader) headers["authorization"] = this.authHeader;
    const res = await this.http.send({
      url: `${this.baseUrl}${path}`,
      method: "GET",
      headers,
      signal,
      timeoutMs: this.timeoutMs,
    });
    return this.parse<T>(res, path);
  }

  private async parse<T>(res: HttpResponse, path: string): Promise<T> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      throw new UnavailableError(
        `adguard ${path} returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    return res.json<T>();
  }
}

function topKey(arr: Array<Record<string, number>> | undefined): string {
  if (!arr || arr.length === 0) return "N/A";
  const first = arr[0];
  if (!first) return "N/A";
  const key = Object.keys(first)[0];
  return key ?? "N/A";
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
