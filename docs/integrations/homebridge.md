---
title: Homebridge Integration
type: integration
status: active
date: 2026-04-09
tags: [integration, services, backend, monitoring]
description: Homebridge smart home integration with accessories and version info
aliases: [homebridge, smart home, accessories, homekit]
---

# Homebridge Integration

> [!abstract] Overview
> Monitors Homebridge smart home server with version info, server information, and accessories listing.

## Configuration

```bash
HOMEBRIDGE_URL=http://192.0.2.210:8581
HOMEBRIDGE_AUTH_TOKEN=your-homebridge-token
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

[[apps/backend/services/HomebridgeService.js|HomebridgeService.js]]

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
- **Normalized Accessories Shape**: `GET /api/accessories` now normalizes upstream Homebridge accessories payloads via route-level helper `extractHomebridgeAccessories()` in `[[apps/backend/routes/homebridgeRoutes.js]]` before pagination.
- **Cached Accessories Fallback**: If a fresh fetch fails but prior accessories data exists, `GET /api/accessories` serves the last known list from `lastData` and still responds with HTTP `200` (`[[apps/backend/routes/homebridgeRoutes.js]]`, `[[apps/backend/services/HomebridgeService.js]]`)
- **Warning passthrough semantics preserved**: If Homebridge accessories fetch fails and no accessory list is available, endpoint still returns HTTP `200` with empty paginated `data` plus `warning`/`message` fields so UI can degrade gracefully without hard request failures (`[[apps/backend/routes/homebridgeRoutes.js]]`)
- **Self-Signed HTTPS Support**: Homebridge HTTPS requests use a permissive TLS agent to support common self-hosted setups with self-signed certificates (`[[apps/backend/services/HomebridgeService.js]]`)

## Route Registration

- Homebridge special routes are registered via `[[apps/backend/routes/homebridgeRoutes.js]]` and integrated from `[[apps/backend/server.js]]`.
- Core `/api/homebridge/status` and `/api/homebridge/stats` still come from factory-generated service routes.

## Frontend Component

[[apps/frontend/src/components/HomebridgeCard.tsx|HomebridgeCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/api/index|API Documentation]]
