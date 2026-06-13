---
title: AdGuard Home Integration
type: integration
status: active
date: 2026-06-13
tags:
  [
    integration,
    services,
    backend,
    monitoring,
    two-tier,
    icmp,
    ping,
    extended-stats,
    dhcp,
    filtering,
    ttl-memo,
    top-upstreams,
  ]
description: AdGuard Home DNS ad blocker integration with two-tier health model (ICMP + HTTP probe), extended statistics (filtering, clients, DHCP, security features), 10-min memoized config endpoints, and upstream response-time metrics (>=0.107.30)
aliases: [adguard, adguard home, dns, ad blocker]
---

# AdGuard Home Integration

> [!abstract] Overview
> Monitors AdGuard Home DNS-level ad blocker with two-tier health model: ICMP ping to the host, plus HTTP probe to the AdGuard API. Provides query statistics, filter status, and protection toggle control.

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to AdGuard host
- **Service tier** — HTTP `GET /control/status` probe
- **Composite reachability** — `reachable = service.reachable` — daemon-primary: the control-API probe defines health; the host/ICMP tier is retained for diagnostics only (see [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]])

If host is unreachable, service tier is skipped; dashboard shows both indicators red.

## Configuration

Configuration lives in the DuckDB config store, managed via the Settings UI or the `/config` API. Environment variables (`ADGUARD_*`) are legacy and were imported once on first boot — they are now ignored (see ADR-015 / ADR-008).

| Field        | Type    | Required | Default                 | Secret  | Description                                                                                     |
| ------------ | ------- | -------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `instanceId` | text    | yes      | `"main"`                | no      | Unique identifier for this instance                                                             |
| `enabled`    | boolean | —        | `true`                  | no      | Enable/disable polling                                                                          |
| `baseUrl`    | URL     | **yes**  | —                       | no      | AdGuard Home base URL (e.g. `http://192.0.2.1`). Host is extracted from this URL for ICMP ping. |
| `username`   | text    | no       | `""`                    | no      | AdGuard Home username for HTTP Basic auth. Leave empty if auth is disabled.                     |
| `password`   | text    | no       | `""`                    | **yes** | AdGuard Home password for HTTP Basic auth. Encrypted at rest.                                   |
| `timeoutMs`  | number  | —        | `5000`                  | no      | Request timeout in milliseconds (applies to both ICMP ping and HTTP probe)                      |
| `cacheTtlMs` | number  | —        | `10000`                 | no      | Stats cache TTL in milliseconds                                                                 |
| `pollPolicy` | object  | —        | health 10 s, stats 30 s | no      | Poll intervals and jitter                                                                       |

**Authentication:** When `username` or `password` is non-empty, the service sends an `Authorization: Basic <base64>` header on every API request. Both fields default to empty (no auth).

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025).

| Endpoint                       | Description              |
| ------------------------------ | ------------------------ |
| `GET /services/adguard/health` | Health check             |
| `GET /services/adguard/stats`  | Query stats, filter info |

## Service Class

`[[apps/backend/src/domain/services/adguard/AdGuardService.ts|AdGuardService.ts]]`

### Health Check (`checkHealth()`)

Uses `withHostPing()` helper to run ICMP ping and HTTP probe in parallel:

```ts
withHostPing(
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
    return {
      reachable: running,
      latencyMs,
      details: {
        version: status.version,
        protectionEnabled: Boolean(status.protection_enabled),
      },
    };
  },
  this.now(),
  signal
);
```

Returns `HealthSnapshot` with `host` and `service` tiers.

### Stats (`getStats()`)

Per poll cycle only `/control/status` and `/control/stats` are fetched. The 7 config-grade endpoints are **memoized for 10 minutes** via `core/ttlMemo.ts` (see [[docs/reference/code-patterns#ttlmemo--slow-lane-memoization|Code Patterns — ttlMemo]]) and served from cache between TTL refreshes.

#### Core Metrics (fetched every poll)

These two endpoints must succeed; failure returns an error:

| Endpoint          | Metrics Exposed                                                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/control/status` | `version`, `running`, `protectionEnabled`, `dnsPort`, `httpPort`                                                                                                                                                                               |
| `/control/stats`  | `totalQueries`, `blockedQueries`, `allowedQueries`, `blockingRate`, `avgProcessingTime`, `topBlockedDomain`, `topQueriedDomain`, `topClient`, `safebrowsingBlocked`, `safesearchBlocked`, `parentalBlocked`, `topUpstream`, `topUpstreamAvgMs` |

#### Extended Metrics (10-min slow lane via ttlMemo)

The following 7 endpoints are optional and memoized. If any fails, it returns `null` for its metrics; overall `getStats` succeeds:

| Endpoint                       | Graceful Return on Failure | Metrics Exposed                                              |
| ------------------------------ | -------------------------- | ------------------------------------------------------------ |
| `/control/filtering/status`    | `{}`                       | `filteringEnabled`, `filterCount`, `totalRules`, `userRules` |
| `/control/clients`             | `{}`                       | `clientCount`, `autoClientCount`                             |
| `/control/dhcp/status`         | `{}`                       | `dhcpEnabled`, `dhcpLeases`, `dhcpStaticLeases`              |
| `/control/safebrowsing/status` | `{}`                       | `safebrowsingEnabled`                                        |
| `/control/parental/status`     | `{}`                       | `parentalEnabled`                                            |
| `/control/safesearch/status`   | `{}`                       | `safesearchEnabled`                                          |
| `/control/dns_info`            | `{}`                       | `upstreamCount`, `upstreamMode`                              |

#### Metric Details

**All Metrics (29 total):**

| Metric                | Type           | Description                                                                                                   |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `version`             | string         | AdGuard Home version (e.g., "v0.107.30")                                                                      |
| `running`             | boolean        | Service running state                                                                                         |
| `protectionEnabled`   | boolean        | DNS protection enabled flag                                                                                   |
| `dnsPort`             | number         | DNS server port                                                                                               |
| `httpPort`            | number         | HTTP API port                                                                                                 |
| `totalQueries`        | number         | Total DNS queries processed                                                                                   |
| `blockedQueries`      | number         | Sum of all blocked queries (filtering + safebrowsing + safesearch + parental)                                 |
| `allowedQueries`      | number         | Allowed queries = totalQueries - blockedQueries                                                               |
| `blockingRate`        | number         | Percentage of blocked queries (0–100, rounded to 2 decimals)                                                  |
| `avgProcessingTime`   | number         | Average DNS query processing time (milliseconds)                                                              |
| `topBlockedDomain`    | string         | Most-blocked domain name (or "N/A")                                                                           |
| `topQueriedDomain`    | string         | Most-queried domain name (or "N/A")                                                                           |
| `topClient`           | string         | Most-active client IP (or "N/A")                                                                              |
| `safebrowsingBlocked` | number         | Queries blocked by SafeBrowsing filter                                                                        |
| `safesearchBlocked`   | number         | Queries blocked by SafeSearch enforcement                                                                     |
| `parentalBlocked`     | number         | Queries blocked by Parental Control filter                                                                    |
| `topUpstream`         | string \| null | Most-used upstream DNS server address (from `top_upstreams_responses`; AdGuard ≥ 0.107.30)                    |
| `topUpstreamAvgMs`    | number \| null | Average response time of the top upstream in milliseconds (from `top_upstreams_avg_time`; AdGuard ≥ 0.107.30) |
| `filteringEnabled`    | boolean        | Filtering toggle state (or `null` on fetch failure)                                                           |
| `filterCount`         | number         | Number of configured filter lists                                                                             |
| `totalRules`          | number         | **Only counts enabled filter lists** (filters with `enabled !== false`)                                       |
| `userRules`           | number         | Count of custom user-defined rules                                                                            |
| `clientCount`         | number         | Number of unique clients                                                                                      |
| `autoClientCount`     | number         | Number of auto-detected clients                                                                               |
| `dhcpEnabled`         | boolean        | DHCP server enabled (or `null` on fetch failure)                                                              |
| `dhcpLeases`          | number         | Active DHCP leases                                                                                            |
| `dhcpStaticLeases`    | number         | Static DHCP leases                                                                                            |
| `safebrowsingEnabled` | boolean        | SafeBrowsing protection enabled (or `null` on fetch failure)                                                  |
| `parentalEnabled`     | boolean        | Parental Control enabled (or `null` on fetch failure)                                                         |
| `safesearchEnabled`   | boolean        | SafeSearch enforcement enabled (or `null` on fetch failure)                                                   |
| `upstreamCount`       | number         | Number of configured upstream DNS servers                                                                     |
| `upstreamMode`        | string         | Upstream DNS mode (e.g., "parallel", "sequential", or `null`)                                                 |

> [!info] `topUpstream` / `topUpstreamAvgMs`
> These fields are sourced from `top_upstreams_responses` and `top_upstreams_avg_time` in the `/control/stats` response. They are `null` on AdGuard Home versions older than 0.107.30 that do not include these keys.

#### Graceful Degradation

All 7 slow-lane endpoints use `.catch(() => null)` to suppress errors:

```ts
const filtering = await this.get<FilteringStatus>(
  "/control/filtering/status",
  signal
).catch((): FilteringStatus | null => null);
// ... (repeated for 6 other optional endpoints)
```

If an optional endpoint fails (timeout, 5xx, missing auth, etc.), that metric set defaults to `null` or `0`; the overall `getStats()` call still succeeds with partial data. Only failures in the two core endpoints (`/control/status`, `/control/stats`) cause `getStats()` to return an error.

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
- [[docs/features/service-monitoring|Service Monitoring]]
- [[docs/reference/code-patterns#ttlmemo--slow-lane-memoization|Code Patterns — ttlMemo]]
- [[docs/performance/caching-strategies|Caching Strategies]]
