---
title: Homebridge Integration
type: integration
status: active
date: 2026-05-07
tags: [integration, services, backend, monitoring, two-tier, icmp, http, hb1-jwt-refactor]
description: Homebridge smart home integration with two-tier health model (ICMP + HTTP probe), JWT token refresh via jwtClient infra primitive
aliases: [homebridge, smart home, accessories, homekit]
---

# Homebridge Integration

> [!abstract] Overview
> Monitors Homebridge smart home server with two-tier health model: ICMP ping to the host, plus HTTP probe to the Homebridge Config UI X API. Provides server info, accessories listing, and configuration.

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to Homebridge host
- **Service tier** — HTTP `GET /api/status/homebridge` probe
- **Composite reachability** — `host.reachable AND service.reachable`

## Configuration

```bash
HOMEBRIDGE_URL=http://192.0.2.210:8581
HOMEBRIDGE_AUTH_TOKEN=your-homebridge-token
HOMEBRIDGE_TIMEOUT=10000  # optional, default 10s
```

## Endpoints

| Endpoint                             | Description                  | Auth              |
| ------------------------------------ | ---------------------------- | ----------------- |
| `GET /api/homebridge/status`         | Health check                 | No (rate limited) |
| `GET /api/homebridge/stats`          | Server statistics            | Yes               |
| `GET /api/status/homebridge-version` | Homebridge version           | Yes               |
| `GET /api/status/server-information` | Server information           | Yes               |
| `GET /api/accessories`               | Accessories list (paginated) | Yes               |
| `GET /api/homebridge/updates`        | Check for updates            | Yes               |

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
- Core `/api/homebridge/status` and `/api/homebridge/stats` come from the standard service route plugin.

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/index|API Documentation]]
- [[docs/api/services-health|Services Health API]]
