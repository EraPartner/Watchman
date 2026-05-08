---
title: AdGuard Home Integration
type: integration
status: active
date: 2026-05-08
tags: [integration, services, backend, monitoring, two-tier, icmp, ping, extended-stats, dhcp, filtering]
description: AdGuard Home DNS ad blocker integration with two-tier health model (ICMP + HTTP probe) and extended statistics (filtering, clients, DHCP, security features)
aliases: [adguard, adguard home, dns, ad blocker]
---

# AdGuard Home Integration

> [!abstract] Overview
> Monitors AdGuard Home DNS-level ad blocker with two-tier health model: ICMP ping to the host, plus HTTP probe to the AdGuard API. Provides query statistics, filter status, and protection toggle control.

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to AdGuard host
- **Service tier** — HTTP `GET /control/status` probe
- **Composite reachability** — `host.reachable AND service.reachable`

If host is unreachable, service tier is skipped; dashboard shows both indicators red.

## Configuration

```bash
ADGUARD_MAIN_URL=http://192.0.2.1
ADGUARD_MAIN_AUTH=your-adguard-auth-token
ADGUARD_TIMEOUT=10000  # optional, default 10s
```

**Configuration Notes:**
- `ADGUARD_MAIN_URL` — HTTP endpoint (host is extracted from URL for ping)
- `ADGUARD_TIMEOUT` — Timeout for both host ping and service probe

## Endpoints

| Endpoint                       | Description              | Auth              |
| ------------------------------ | ------------------------ | ----------------- |
| `GET /api/adguard/status`      | Health check             | No (rate limited) |
| `GET /api/adguard/stats`       | Query stats, filter info | Yes               |
| `POST /api/adguard/protection` | Toggle protection        | Yes + CSRF        |
| `GET /api/adguard/updates`     | Check for updates        | Yes               |

## Service Class

`[[apps/backend/src/domain/services/AdGuardService.ts|AdGuardService.ts]]`

### Health Check (`checkHealth()`)

Uses `withHostPing()` helper to run ICMP ping and HTTP probe in parallel:

```ts
withHostPing(
  {
    host: urlHost,
    timeoutMs: this.timeoutMs,
    pingCount: 4,
    prober: this.ping
  },
  async (signal) => {
    // HTTP GET /control/status
    const res = await fetch(`${this.url}/control/status`, { signal });
    const json = await res.json();
    return {
      reachable: res.ok,
      latencyMs: Date.now() - start,
      message: res.ok ? 'OK' : `HTTP ${res.status}`
    };
  },
  Date.now(),
  signal
);
```

Returns `HealthSnapshot` with `host` and `service` tiers.

### Stats (`getStats()`)

Returns comprehensive service metrics across 9 parallel API endpoints with graceful degradation.

#### Core Metrics (Required Endpoints)

These two endpoints must succeed; failure returns an error:

| Endpoint          | Metrics Exposed                                                       |
| ----------------- | --------------------------------------------------------------------- |
| `/control/status` | `version`, `running`, `protectionEnabled`, `dnsPort`, `httpPort`      |
| `/control/stats`  | `totalQueries`, `blockedQueries`, `allowedQueries`, `blockingRate`, `avgProcessingTime`, `topBlockedDomain`, `topQueriedDomain`, `topClient`, `safebrowsingBlocked`, `safesearchBlocked`, `parentalBlocked` |

#### Extended Metrics (Optional Endpoints)

The following 7 endpoints are optional. If any fails, it returns `null` for its metrics; overall `getStats` succeeds:

| Endpoint                      | Graceful Return on Failure | Metrics Exposed                                   |
| ----------------------------- | -------------------------- | ------------------------------------------------- |
| `/control/filtering/status`   | `{}`                       | `filteringEnabled`, `filterCount`, `totalRules`, `userRules` |
| `/control/clients`            | `{}`                       | `clientCount`, `autoClientCount`                  |
| `/control/dhcp/status`        | `{}`                       | `dhcpEnabled`, `dhcpLeases`, `dhcpStaticLeases`  |
| `/control/safebrowsing/status`| `{}`                       | `safebrowsingEnabled`                             |
| `/control/parental/status`    | `{}`                       | `parentalEnabled`                                 |
| `/control/safesearch/status`  | `{}`                       | `safesearchEnabled`                               |
| `/control/dns_info`           | `{}`                       | `upstreamCount`, `upstreamMode`                   |

#### Metric Details

**All Metrics (27 total):**

| Metric                   | Type    | Description                                              |
| ------------------------ | ------- | -------------------------------------------------------- |
| `version`                | string  | AdGuard Home version (e.g., "v0.107.30")                |
| `running`                | boolean | Service running state                                   |
| `protectionEnabled`      | boolean | DNS protection enabled flag                              |
| `dnsPort`                | number  | DNS server port                                         |
| `httpPort`               | number  | HTTP API port                                           |
| `totalQueries`           | number  | Total DNS queries processed                              |
| `blockedQueries`         | number  | Sum of all blocked queries (filtering + safebrowsing + safesearch + parental) |
| `allowedQueries`         | number  | Allowed queries = totalQueries - blockedQueries         |
| `blockingRate`           | number  | Percentage of blocked queries (0–100, rounded to 2 decimals) |
| `avgProcessingTime`      | number  | Average DNS query processing time (milliseconds)        |
| `topBlockedDomain`       | string  | Most-blocked domain name (or "N/A")                     |
| `topQueriedDomain`       | string  | Most-queried domain name (or "N/A")                     |
| `topClient`              | string  | Most-active client IP (or "N/A")                        |
| `safebrowsingBlocked`    | number  | Queries blocked by SafeBrowsing filter                  |
| `safesearchBlocked`      | number  | Queries blocked by SafeSearch enforcement               |
| `parentalBlocked`        | number  | Queries blocked by Parental Control filter              |
| `filteringEnabled`       | boolean | Filtering toggle state (or `null` on fetch failure)    |
| `filterCount`            | number  | Number of configured filter lists                       |
| `totalRules`             | number  | **Only counts enabled filter lists** (filters with `enabled !== false`) |
| `userRules`              | number  | Count of custom user-defined rules                      |
| `clientCount`            | number  | Number of unique clients                                |
| `autoClientCount`        | number  | Number of auto-detected clients                         |
| `dhcpEnabled`            | boolean | DHCP server enabled (or `null` on fetch failure)       |
| `dhcpLeases`             | number  | Active DHCP leases                                      |
| `dhcpStaticLeases`       | number  | Static DHCP leases                                      |
| `safebrowsingEnabled`    | boolean | SafeBrowsing protection enabled (or `null` on fetch failure) |
| `parentalEnabled`        | boolean | Parental Control enabled (or `null` on fetch failure)  |
| `safesearchEnabled`      | boolean | SafeSearch enforcement enabled (or `null` on fetch failure) |
| `upstreamCount`          | number  | Number of configured upstream DNS servers               |
| `upstreamMode`           | string  | Upstream DNS mode (e.g., "parallel", "sequential", or `null`) |

#### Graceful Degradation

All 7 optional endpoints use `.catch(() => null)` to suppress errors:

```ts
const filtering = await this.get<FilteringStatus>('/control/filtering/status', signal)
  .catch((): FilteringStatus | null => null);
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
