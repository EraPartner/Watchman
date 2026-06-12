---
title: API Documentation
type: index
status: active
date: 2026-06-12
tags:
  [
    api,
    index,
    backend,
    openapi,
    endpoint,
    rest,
    fastify,
    backup,
    export,
    import,
    v2,
    single-user,
    stats,
    service-metrics,
    ipfs,
    ipfs-extended-stats,
    dht,
    raspberry-pi,
    throttled,
    pi1,
    roon,
    zones,
    now-playing,
    rn1,
    rn2,
    cors,
    websocket,
    swr-cache,
  ]
description: Complete API endpoint documentation for Watchman - REST API with OpenAPI 3.1 specification, JWT auth + CORS origin allow-list, service stats and metrics including IPFS extended metrics, Raspberry Pi vcgencmd + /proc metrics with throttling detection (PI1), and Roon zone/now-playing tracking (RN1/RN2)
aliases:
  [api index, endpoints, rest api, swagger, openapi spec, backup api, stats api]
---

# API Documentation

> [!abstract] Overview
> Watchman provides a RESTful API with a TypeScript + Fastify 4 backend. The OpenAPI 3.1 specification is complete and reflects all current endpoints. JWT authentication is enforced on protected endpoints; the `/meta/health` liveness probe is public.
>
> **Base URL**: `http://localhost:3001` (development)
>
> **API Version**: 2.0.0
> **License**: AGPL-3.0-only
>
> **Authentication**: JWT via HTTP-only cookie + CSRF double-submit cookie. Trusted-network deployment — CORS enforces an origin allow-list (loopback, `watchman://`, plus any extras in `CORS_ALLOWED_ORIGINS`). See [[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025]] and [[docs/security/authentication|Authentication]] for details.

## CORS and Preflight Behavior

All API requests with an `Origin` header are checked against the origin allow-list:

- **Allowed origins**: `watchman://` (Electron desktop), `http://localhost:*`, `http://127.0.0.1:*`, and any origins listed in the `CORS_ALLOWED_ORIGINS` environment variable (comma-separated).
- **Allowed request (OPTIONS)**: responds `204 No Content` with `Access-Control-Allow-Origin`, `Vary: Origin`, and `Access-Control-Allow-Credentials: true`.
- **Blocked request (OPTIONS)**: responds `403 Forbidden` with no CORS headers.
- **No Origin header** (non-browser clients, curl, server-to-server): always allowed — the gate exists to prevent cross-site browser requests, not to block API clients on the trusted network.

## Response Envelope

All API responses use a consistent envelope format:

**Success Response:**

```json
{
  "data": {
    /* response payload */
  }
}
```

**Error Response:**

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Error Codes

| Code           | HTTP Status | Meaning                                 |
| -------------- | ----------- | --------------------------------------- |
| `NOT_FOUND`    | 404         | Service instance or resource not found  |
| `UNAVAILABLE`  | 503         | Service is unreachable or unhealthy     |
| `UNAUTHORIZED` | 401         | Missing or invalid authentication       |
| `TIMEOUT`      | 408         | Request timeout while polling service   |
| `CIRCUIT_OPEN` | 503         | Circuit breaker is open for the service |
| `VALIDATION`   | 400         | Invalid request parameters or body      |

## Endpoint Categories

### Meta Endpoints

Operational health and version information.

| Endpoint            | Method | Description                     |
| ------------------- | ------ | ------------------------------- |
| `GET /meta/health`  | GET    | Liveness probe (no auth needed) |
| `GET /meta/version` | GET    | API version and Node info       |

**Response Example** (`/meta/health`):

```json
{
  "ok": true,
  "service": "watchman-backend-v2",
  "uptime": 3600,
  "timestamp": "2026-04-18T12:00:00Z"
}
```

**Note on `/meta/health`**: Useful for monitoring the backend liveness, especially when monitoring the Watchman backend itself as a service.

### Services Endpoints

Service health, stats, and control.

| Endpoint                        | Method | Description                          | Query Parameters      | Since |
| ------------------------------- | ------ | ------------------------------------ | --------------------- | ----- |
| `GET /services`                 | GET    | Aggregated health for all services   | -                     | v1.0  |
| `GET /services/{kind}/health`   | GET    | Health for specific service instance | `instance` (optional) | v1.0  |
| `GET /services/{kind}/stats`    | GET    | Stats for specific service instance  | `instance` (optional) | v1.0  |
| `POST /services/{kind}/control` | POST   | Issue control action to service      | `instance` (optional) | v1.0  |

**Path Parameters:**

- `{kind}`: Service kind (e.g., `bitcoin`, `ipfs`, `homebridge`, etc.)

**Query Parameters:**

- `instance`: Instance ID. Omit to use first registered instance for the kind.

**Health Response** (with two-tier model):

```json
{
  "data": {
    "reachable": true,
    "latencyMs": 45,
    "message": "OK",
    "details": {
      /* service-specific details */
    },
    "at": 1713446400000,
    "host": {
      "reachable": true,
      "pingMs": 12
    },
    "service": {
      "reachable": true,
      "latencyMs": 45
    }
  }
}
```

The **two-tier health model** (since Phase 0a) separates ICMP host reachability from service protocol probe reachability:

- `host.reachable` — ICMP ping to the host succeeded
- `service.reachable` — Service protocol probe (HTTP, RPC, etc.) succeeded
- `reachable` (top-level) — Composite: semantics depend on service (typically `host AND service`)

See [[docs/api/services-health|Services Health]] for full details.

**Stats Response**:

```json
{
  "data": {
    "metrics": {
      "key1": 123,
      "key2": "value",
      "key3": true
    },
    "at": 1713446400000
  }
}
```

**Examples by Service:**

- **Raspberry Pi** (direct SSH, PI1) — cpuTemp, clockRate, voltage, **throttled**, load, memory, uptime, prettyName, processor, isRpi, pigpioVersion. The `throttled` field (0 = healthy, non-zero = throttling/undervoltage) comes from `vcgencmd get_throttled`. See [[docs/integrations/raspberry-pi#metrics|Raspberry Pi Metrics]].
- **IPFS** (IP1) — 9 endpoints with graceful degradation; extended stats on daemon, DHT, pinning, and listen addresses. See [[docs/integrations/ipfs|IPFS Integration]].
- **Roon** (RN1/RN2) — Zone tracking and now-playing metadata when API enabled (optional). Includes paired, zoneCount, activeZones, nowPlaying. See [[docs/integrations/roon#stats-with-api|Roon Integration]].
- **qBittorrent** (QB1) — Per-torrent stats with speeds, progress, ETA, and incremental update windows.
- **AdGuard Home** (AG1) — Filtering, clients, DHCP, security features. See [[docs/integrations/adguard|AdGuard Integration]].

**Control Request Body** (`/services/{kind}/control`):

```json
{
  "action": "restart"
}
```

### Configuration & Setup Endpoints

Runtime service configuration CRUD with encryption, audit trail, backup/restore, and service-specific pairing wizards.

| Endpoint                          | Method | Description                                | Since |
| --------------------------------- | ------ | ------------------------------------------ | ----- |
| `GET /setup/status`               | GET    | Setup wizard status                        | v2.2  |
| `POST /setup/philips-bridge/pair` | POST   | Pair with Philips Hue Bridge (link button) | v2.4  |
| `GET /config/kinds`               | GET    | Service kind schemas with field metadata   | v2.2  |
| `GET /config/services`            | GET    | List all configured services               | v2.2  |
| `POST /config/services`           | POST   | Create new service instance                | v2.2  |
| `GET /config/services/{id}`       | GET    | Fetch single service instance              | v2.2  |
| `PUT /config/services/{id}`       | PUT    | Update service instance (hot-reload)       | v2.2  |
| `DELETE /config/services/{id}`    | DELETE | Delete service instance                    | v2.2  |
| `POST /config/services/{id}/test` | POST   | Test connection with credentials           | v2.2  |
| `GET /config/audit`               | GET    | Configuration audit trail                  | v2.2  |
| `GET /config/export`              | GET    | Export all configs as encrypted bundle     | v2.3  |
| `POST /config/import`             | POST   | Import encrypted bundle (backup restore)   | v2.3  |

Full reference: [[docs/api/config|Configuration API Documentation]]

**Setup/Pairing Endpoints:**

- **Philips Hue Pairing** (`POST /setup/philips-bridge/pair`) — Automates obtaining `applicationKey` and `certHash` by probing TLS cert and calling the bridge's `/api` endpoint. Requires physical link button press. See [[docs/integrations/philips-hue#pairing-wizard-h2-task|Pairing Wizard documentation]].

### Instances Endpoints

Service instance discovery and metadata (legacy; use `/config/services` instead).

| Endpoint                | Method | Description                      |
| ----------------------- | ------ | -------------------------------- |
| `GET /instances`        | GET    | All registered service instances |
| `GET /instances/{kind}` | GET    | Instances for a given service    |
| `GET /kinds`            | GET    | All registered service kinds     |

**Instance Response**:

```json
{
  "data": [
    {
      "id": "bitcoin:main",
      "kind": "bitcoin",
      "instanceId": "main"
    }
  ]
}
```

### Metrics Endpoints

Operational metrics (circuit breakers, background poller, cache, process).

| Endpoint       | Method | Description                  |
| -------------- | ------ | ---------------------------- |
| `GET /metrics` | GET    | Operational metrics snapshot |

**Metrics Response**:

```json
{
  "breakers": {
    "bitcoin:main:health": {
      "state": "closed",
      "successes": 150,
      "failures": 2,
      "rejects": 0,
      "trips": 0,
      "openedAt": null
    },
    "bitcoin:main:stats": {
      "state": "closed",
      "successes": 148,
      "failures": 0,
      "rejects": 0,
      "trips": 0,
      "openedAt": null
    }
  },
  "poller": {
    "tracked": 14
  },
  "cache": {
    "bitcoin:main:stats": {
      "size": 1,
      "hits": 120,
      "misses": 4
    },
    "tor:main:stats": {
      "size": 1,
      "hits": 98,
      "misses": 3
    }
  },
  "errors": {
    "total": 7,
    "byService": {
      "tor:main": 3,
      "adguard:main": 4
    }
  },
  "process": {
    "uptimeSec": 3600,
    "rss": 85983232,
    "heapUsed": 52428800
  }
}
```

**Key points about the metrics shape:**

- `breakers` — one entry per circuit-breaker name, keyed as `{kind}:{instanceId}:health` and `{kind}:{instanceId}:stats`. Both health and stats probes have independent breakers. State is `"closed"` (normal), `"open"` (tripped), or `"half-open"` (testing recovery). `openedAt` is epoch-ms when the breaker last tripped, or `null`.
- `breakers[*].trips` increments each time the breaker transitions from closed/half-open to open. A non-zero `trips` value indicates the service has failed repeatedly (≥5 consecutive failures trigger a trip; 60 s reset before half-open probe).
- `poller.tracked` — current count of services tracked by the background poller.
- `cache` — one entry per registered SWR cache, keyed as `{kind}:{instanceId}:stats`. `hits` = requests served from fresh cache; `misses` = blocking fetches (first call or after TTL expired).
- `errors` — cumulative service error counter since process start. `byService` keys are composite `{kind}:{instanceId}` ids.
- `process` — Node.js process stats: `uptimeSec` (integer seconds), `rss` and `heapUsed` in bytes.

## OpenAPI Specification

The complete API specification is defined in OpenAPI 3.1 format:

| Resource      | Location                      | Details                       |
| ------------- | ----------------------------- | ----------------------------- |
| **Spec File** | [[apps/backend/openapi.yaml]] | OpenAPI 3.1 spec, v2.0.0      |
| **Format**    | JSON/YAML                     | Machine-readable API contract |
| **License**   | AGPL-3.0-only                 | Same as backend               |

The specification is the canonical source for all endpoint definitions, request/response schemas, and error codes. All endpoints listed in the Endpoint Categories section above are reflected in the spec.

### Schema Definitions

Key schemas defined in the OpenAPI spec:

**Core Schemas:**

- **HealthSnapshot** - Composite reachability, latency, details, timestamp, plus `host` and `service` tiers
- **HostHealth** - ICMP reachability tier (reachable, pingMs)
- **ServiceHealth** - Service protocol probe tier (reachable, latencyMs, message, details)
- **StatsSnapshot** - Service metrics dictionary and timestamp
- **AggregatedEntry** - Service result (success or error) with health snapshot
- **InstanceInfo** - Service instance metadata (id, kind, instanceId)
- **MetricsSnapshot** - Operational metrics (breakers, poller, cache, process)
- **BreakerMetrics** - Circuit breaker state and counters
- **CacheStats** - Cache hit/miss counts and size
- **PollerStats** - Poll timing and frequency statistics
- **DomainError** - Standard error envelope (code, message)

**Service-Specific Schemas:**

- **AdGuardStats** - AdGuard Home metrics with extended filtering, clients, DHCP, and security feature states (AG1 — 27 metrics; 2 core endpoints + 7 optional with graceful degradation)
- **IpfsStats** - IPFS node metrics including system diagnostics, DHT routing table, pins, and listen addresses (IP1 — 9 endpoints total; 5 core + 4 optional with graceful degradation)
- **QBittorrentStats** - qBittorrent metrics including per-torrent details, error counts, and log events (QB1 — incremental sync + per-torrent stats + logs)
- **QBittorrentTorrentInfo** - Individual torrent metadata (hash, name, state, progress, speeds, sizes, ETA, category)

See [[apps/backend/openapi.yaml]] for complete definitions with examples.

## Related Documentation

- [[docs/integrations/index|Service Integrations]]
- [[docs/reference/error-codes|Error Codes Reference]]
- [[docs/security/authentication|Authentication]]
- [[docs/security/rate-limiting|Rate Limiting]]
- [[apps/backend/openapi.yaml|OpenAPI Spec (Code)]]
