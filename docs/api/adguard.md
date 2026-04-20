---
title: "API: AdGuard Service"
type: api
status: superseded
date: 2026-04-09
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [api, adguard, service, dns, backend]
description: AdGuard Home monitoring API endpoints plus a limited filtering toggle endpoint
aliases: [adguard api, adguard endpoints]
---

# AdGuard API Endpoints

> [!danger] Superseded — No Longer Implemented
> This document describes **v1 AdGuard API endpoints** with Express.js auth/rate-limit annotations. The backend was rewritten to TypeScript + Fastify 4 in v2.0; current API is defined in the OpenAPI spec (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]]). Content retained for archival reference only.


> [!abstract] Overview
> Monitoring-focused AdGuard Home API endpoints. Includes a limited DNS protection toggle and real-time update streaming via WebSocket.

## Endpoints Summary

| Method | Path                      | Description               | Auth       | Rate Limit       |
| ------ | ------------------------- | ------------------------- | ---------- | ---------------- |
| `GET`  | `/api/adguard/status`     | Health check              | No         | `healthLimiter`  |
| `GET`  | `/api/adguard/stats`      | Detailed stats            | Yes        | `generalLimiter` |
| `POST` | `/api/adguard/protection` | Toggle protection         | Yes + CSRF | `controlLimiter` |
| `GET`  | `/api/adguard/updates`    | Update stream (WebSocket) | No         | `healthLimiter`  |

---

## GET /api/adguard/status

Lightweight health check returning AdGuard Home availability and basic status.

### Response

#### 200 OK

```json
{
  "status": "online",
  "timestamp": "2026-04-02T12:00:00.000Z",
  "data": {
    "protection_enabled": true,
    "dns_addresses": ["192.168.1.1"],
    "dns_port": 53
  }
}
```

#### 503 Service Unavailable

```json
{
  "error": "AdGuard service not configured",
  "status": "offline"
}
```

### Cache

Responses are cached via `healthCacheMiddleware`.

---

## GET /api/adguard/stats

Detailed AdGuard Home statistics including query counts, blocked domains, and filtering status.

### Response

#### 200 OK

```json
{
  "timestamp": "2026-04-02T12:00:00.000Z",
  "data": {
    "dns_queries": 15234,
    "blocked_filtering": 3421,
    "replaced_safebrowsing": 12,
    "enforced_safesearch": 0,
    "response_time": 45,
    "avg_processing_time": 0.012,
    "top_blocked_domains": [{ "domain": "ads.example.com", "count": 234 }],
    "top_queried_domains": [{ "domain": "google.com", "count": 567 }]
  }
}
```

### Cache

Responses are cached via `statsCacheMiddleware`.

### Source

- Service class: `apps/backend/services/AdGuardService.js`

---

## POST /api/adguard/protection

Toggle AdGuard Home DNS filtering protection on or off.

### Request

```json
{
  "enabled": true,
  "duration": 3600
}
```

| Field      | Type      | Required | Description                  |
| ---------- | --------- | -------- | ---------------------------- |
| `enabled`  | `boolean` | Yes      | Enable or disable protection |
| `duration` | `number`  | No       | Optional duration in seconds |

### Validation

- `enabled` must be a boolean (enforced by `requireBoolean` middleware)
- `duration` must be a number if provided

### Response

#### 200 OK

```json
{
  "success": true
}
```

#### 400 Bad Request

```json
{
  "error": "Duration must be a number (seconds)"
}
```

#### 503 Service Unavailable

```json
{
  "error": "AdGuard service not configured"
}
```

### Side Effects

- Clears both health and stats caches after toggle
- Logs the protection state change

### Source

- Route: `apps/backend/server.js`
- Service class: `apps/backend/services/AdGuardService.js`

---

## GET /api/adguard/updates

Server-Sent Events / WebSocket endpoint for real-time AdGuard status updates.

### Behavior

- Returns update stream via WebSocket manager
- No authentication required
- Clients receive status change events automatically

### Source

- Route factory: `apps/backend/routes/serviceFactory.js`
- WebSocket manager: `apps/backend/services/WebSocketManager.js`

---

## Related

- [[docs/integrations/adguard|AdGuard Integration]]
- [[docs/api/index|API Index]]
- [[docs/features/real-time-updates|Real-Time Updates]]
