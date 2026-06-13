---
title: Homebridge Integration
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
    http,
    hb1-jwt-refactor,
    telemetry,
    cpu,
    memory,
    child-bridges,
    plugins,
    ttl-memo,
  ]
description: Homebridge smart home integration with two-tier health model (ICMP + HTTP probe), JWT token refresh via jwtClient, expanded Config UI X telemetry (CPU, RAM, uptime, child bridges, plugins, accessories, version), and slow-lane ttlMemo for plugin/version checks
aliases: [homebridge, smart home, accessories, homekit]
---

# Homebridge Integration

> [!abstract] Overview
> Monitors Homebridge smart home server with two-tier health model: ICMP ping to the host, plus HTTP probe to the Homebridge Config UI X API. Provides server info, accessories listing, and configuration.

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to Homebridge host
- **Service tier** — HTTP `GET /api/status/homebridge` probe
- **Composite reachability** — `reachable = service.reachable` — daemon-primary: the HTTP API probe defines health; the host/ICMP tier is retained for diagnostics only (see [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]])

## Configuration

Configuration is managed via the Settings UI or the `/config` API (DuckDB config store). Environment variables (`HOMEBRIDGE_*`) are **legacy** — they are imported once on first boot and then ignored (see ADR-015 / ADR-008).

| Field         | Type     | Required | Default                          | Secret  | Notes                                                                                |
| ------------- | -------- | -------- | -------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `baseUrl`     | URL      | yes      | —                                | no      | Base URL of the Homebridge Config UI X server (e.g. `http://192.168.1.10:8581`)      |
| `username`    | text     | no       | `""`                             | no      | Homebridge UI username for login                                                     |
| `password`    | password | no       | `""`                             | **yes** | Homebridge UI password for login                                                     |
| `authToken`   | password | no       | `""`                             | **yes** | Pre-issued JWT bearer token; used if set, otherwise login is performed automatically |
| `statusPath`  | text     | no       | `/api/status/server-information` | no      | Path for the server-information health probe                                         |
| `versionPath` | text     | no       | `/api/status/homebridge-version` | no      | Path for the version check (slow lane)                                               |
| `loginPath`   | text     | no       | `/api/auth/login`                | no      | Path used by jwtClient to obtain a token on 401                                      |
| `instanceId`  | text     | no       | `main`                           | no      | Unique ID when running multiple instances                                            |
| `enabled`     | boolean  | no       | `true`                           | no      | Disable without removing the config                                                  |
| `cacheTtlMs`  | number   | no       | `10000`                          | no      | Stats cache TTL in milliseconds                                                      |
| `timeoutMs`   | number   | no       | `5000`                           | no      | HTTP request timeout in milliseconds                                                 |

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025).

| Endpoint                          | Description       |
| --------------------------------- | ----------------- |
| `GET /services/homebridge/health` | Health check      |
| `GET /services/homebridge/stats`  | Server statistics |

## Service Class

`HomebridgeService` (`apps/backend/src/domain/services/`)

### Methods

- `checkHealth()` - API connection test
- `getStats()` - Server statistics
- `getVersion()` - Homebridge version
- `getServerInformation()` - Detailed server info
- `getAccessories()` - Accessories list with cached fallback
- `login()` - Background authentication
- `checkForUpdates()` - Check for Homebridge updates

## Stats Telemetry (Config UI X API)

`getStats()` now fetches a rich set of system and Homebridge metrics from the Config UI X REST API:

| Endpoint                               | Metrics                                 | Notes                                                                                                       |
| -------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/api/status/cpu`                      | `cpuLoad`, `cpuTemp`                    | CPU load average and temperature                                                                            |
| `/api/status/ram`                      | `memTotalBytes`, `memUsedBytes`         | Host RAM totals                                                                                             |
| `/api/status/uptime`                   | `hostUptime`, `processUptime`           | Host and Homebridge process uptime (seconds)                                                                |
| `/api/status/homebridge`               | `status`                                | Bridge status: `up`, `pending`, or `down`                                                                   |
| `/api/status/homebridge/child-bridges` | `childBridgeCount`, `childBridgesUp`    | Count of child bridges and how many are running                                                             |
| `/api/plugins`                         | `pluginCount`, `pluginUpdatesAvailable` | **Slow lane (15-min ttlMemo)** — plugin list and update count; slow because the UI server checks npm        |
| `/api/accessories`                     | `accessoryCount`                        | `null` unless Homebridge is running in insecure mode                                                        |
| Version endpoint                       | `latestVersion`, `updateAvailable`      | **Slow lane (15-min ttlMemo)** — latest release from npm; `updateAvailable` is `true` when current < latest |

### Status Tone

The frontend renderer warns when `status !== 'up'` or when any child bridges are down (`childBridgesUp < childBridgeCount`). The detail view groups metrics into **Bridge** and **Host** sections.

### Slow-Lane Endpoints (ttlMemo)

Plugin list and version checks are rate-limited to **once per 15 minutes** via `core/ttlMemo.ts` (see [[docs/reference/code-patterns#ttlmemo--slow-lane-memoization|Code Patterns — ttlMemo]]). Cached results are served between TTL refreshes; a real npm check only fires when the cache expires.

## Special Features

- **Background Login**: Homebridge performs background login on initialization
- **Paginated Accessories**: Accessories endpoint supports pagination (default 50, max 100)
- **Normalized Accessories Shape**: `GET /api/accessories` normalizes upstream Homebridge accessories payloads via route-level helper `extractHomebridgeAccessories()` before pagination.
- **Cached Accessories Fallback**: If a fresh fetch fails but prior accessories data exists, `GET /api/accessories` serves the last known list from `lastData` and still responds with HTTP `200`.
- **Warning passthrough semantics preserved**: If Homebridge accessories fetch fails and no accessory list is available, endpoint still returns HTTP `200` with empty paginated `data` plus `warning`/`message` fields so UI can degrade gracefully without hard request failures.
- **Self-Signed HTTPS Support**: Homebridge HTTPS requests use a permissive TLS agent to support common self-hosted setups with self-signed certificates.

## HB1 Phase — JWT Token Refresh (Complete)

HomebridgeService now uses the [[apps/backend/src/infra/http/jwtClient.ts|jwtClient]] infra primitive for token lifecycle management:

### How It Works

1. **innerHttp wrapper** — Dynamically injects cookies from prior responses, ensuring cookie-based auth flows work correctly even when jwtClient retries after a 401
2. **loginFn callback** — Posted to `loginPath` on 401, captures cookies as a side effect, returns JWT token (or empty string for cookie-only auth fallback)
3. **jwtClient wrapper** — Injects `Authorization: Bearer <token>` on every request; on 401, calls `refresh()` once, retries with new token, returns response as-is
4. **Concurrent 401 deduplication** — All concurrent 401s share one pending refresh promise, preventing thundering herd

### Benefits

- Automatic token injection (no manual header manipulation in service)
- Single-retry semantics on 401 (no infinite refresh loops)
- Supports both JWT token and cookie-only auth modes
- Shared refresh promise prevents thundering herd on concurrent 401s
- Cleaner service code (auth logic centralized in infra primitive)

## Route Registration

- Homebridge special routes (accessories, version) are registered as Fastify plugins in `apps/backend/src/transport/http/`.
- Core `GET /services/homebridge/health` and `GET /services/homebridge/stats` come from the standard service route plugin.

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/index|API Documentation]]
- [[docs/api/services-health|Services Health API]]
- [[docs/reference/code-patterns#ttlmemo--slow-lane-memoization|Code Patterns — ttlMemo]]
- [[docs/performance/caching-strategies|Caching Strategies]]
