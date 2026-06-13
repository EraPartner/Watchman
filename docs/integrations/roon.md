---
title: Roon Integration
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
    tcp,
    roon-api,
    websocket,
    zones,
    now-playing,
    rn1,
    rn2,
  ]
description: Roon music server integration with two-tier health model (ICMP + TCP probe) + optional WebSocket API support for zone tracking and now-playing status
aliases: [roon, roon server, music server, roon api, zones]
---

# Roon Integration

> [!abstract] Overview
> Monitors Roon music server with two-tier health model (ICMP ping + TCP probe) and optional WebSocket API integration for real-time zone and now-playing tracking.

## Health Model (Phase 0a)

Two-tier health with inline parallel probe:

- **Host tier** — ICMP ping to Roon host
- **Service tier** — TCP connection probe on Roon ports (default 9100)
- **Composite reachability** — `host.reachable OR service.reachable` (device considered up if either tier responds)

## Roon WebSocket API Integration (RN1 + RN2)

When `useRoonApi: true` (optional, default `false`), the service establishes a persistent WebSocket connection to the Roon Core API and tracks zones, playback state, and now-playing metadata in real time.

### Configuration

Configure via the Settings UI or the `/config` API (DuckDB config store). Legacy `ROON_*` environment variables were imported once on first boot and are now ignored.

| Field        | Type       | Required | Default  | Description                                   |
| ------------ | ---------- | -------- | -------- | --------------------------------------------- |
| `instanceId` | text       | yes      | `"main"` | Unique identifier for this instance           |
| `enabled`    | boolean    | —        | `true`   | Enable/disable this instance                  |
| `host`       | text       | **yes**  | —        | Roon Core IP/hostname                         |
| `ports`      | number\[\] | —        | `[9100]` | TCP ports to probe for liveness               |
| `usePing`    | boolean    | —        | `true`   | Enable ICMP ping probe                        |
| `pingCount`  | number     | —        | `2`      | ICMP ping count per health check              |
| `apiPort`    | number     | —        | `9100`   | Roon Core API (WebSocket) port                |
| `useRoonApi` | boolean    | —        | `false`  | Enable zone/now-playing tracking via Roon API |
| `timeoutMs`  | number     | —        | `5000`   | Probe timeout in ms                           |
| `cacheTtlMs` | number     | —        | `10000`  | Health/stats cache TTL in ms                  |

No secret fields — Roon does not require credentials for the extension pairing model.

### Lifecycle

- **`onStart()`** — When `useRoonApi=true`, connects to Roon Core API via `roonConnect()` and initializes WebSocket. Pairing is asynchronous; initial connection attempt is non-blocking.
- **`onStop()`** — Closes the WebSocket handle and releases resources.

### Roon API Infrastructure (RN1)

Located in `[[apps/backend/src/infra/roon/]]`:

**Contract** (`roonClient.ts`):

- `RoonZone` — Zone state: zoneId, displayName, state (playing|paused|loading|stopped), queueItemsRemaining, queueTimeRemaining, nowPlaying (oneLine, seekPosition, length), outputCount
- `RoonHandle` — Active connection: `getZones()`, `isPaired()`, `close()`
- `RoonConnectFn` — DI factory: `(opts: RoonConnectOptions) => Promise<RoonHandle>`
- `RoonConnectOptions` — host, port, extensionId, displayName, onZonesChanged callback

**Implementation** (`roonClientImpl.ts`):

- Uses `@roonlabs/node-roon-api` (CJS via `createRequire`)
- Wraps `init_services()` + `ws_connect()`
- Subscribes to `com.roonlabs.transport:2` zones via `core.moo._subscribe_helper()`
- Handles zone subscription events: `Subscribed`, `Changed`, `zones_added`, `zones_changed`, `zones_removed`
- Exposes zone snapshot via `getZones()` and pairing status via `isPaired()`

**Tests** (`roonClient.test.ts`):

- 7 contract tests with `makeFakeRoon()` factory covering connection, pairing, zone updates, cleanup

### Stats with API

When API is enabled, `getStats()` includes:

```json
{
  "metrics": {
    "host": "192.0.2.150",
    "portCount": 1,
    "pingEnabled": true,
    "configured": true,
    "paired": true, // Extension pairing status
    "zoneCount": 2, // Total zones
    "activeZones": 1, // Currently playing
    "nowPlaying": "Album - Track Name", // Optional, if track playing
    "zones": [
      // Per-zone detail (since 2026-06-12)
      {
        "name": "Living Room",
        "state": "playing",
        "outputs": 1,
        "nowPlaying": "Album - Track Name"
      },
      { "name": "Office", "state": "stopped", "outputs": 1 }
    ]
  },
  "at": 1714953600000
}
```

When API is disabled (`useRoonApi=false`), only basic metrics returned:

```json
{
  "metrics": {
    "host": "192.0.2.150",
    "portCount": 1,
    "pingEnabled": true,
    "configured": true
  },
  "at": 1714953600000
}
```

> [!info] Tile display when API is disabled
> The `ServiceTile` secondary metric cells for "Zones" and "Playing" are **not rendered** when `useRoonApi=false`, because those fields are absent from the stats payload (null/undefined). Only genuinely-present values are shown; placeholder "—" cells are suppressed. This is the global null-suppression behavior introduced in `ServiceTile` — see [[docs/components/service-tile|ServiceTile]].

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025).

| Endpoint                    | Description                     |
| --------------------------- | ------------------------------- |
| `GET /services/roon/health` | Health check (two-tier)         |
| `GET /services/roon/stats`  | Server info, zones, now-playing |

## Service Implementation

**Class**: `[[apps/backend/src/domain/services/roon/RoonService.ts|RoonService.ts]]`

### Config Fields

- `host` — Roon Core IP/hostname
- `ports` — TCP probe ports (array, default [9100])
- `timeoutMs` — Probe timeout (default 5000)
- `usePing` — Enable ICMP probing (default true)
- `pingCount` — ICMP count (default 2)
- **`apiPort`** (RN2) — WebSocket API port (default 9100)
- **`useRoonApi`** (RN2) — Enable zone tracking (default false)

### Methods

- `checkHealth()` — Parallel ICMP + TCP probes, returns composite reachability
- `getStats()` — Service metrics; includes zone data when API enabled
- **`onStart()`** (RN2) — Connect to API when enabled
- **`onStop()`** (RN2) — Gracefully close API connection

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/adr/020-two-tier-health-and-monitoring-upgrades|ADR-020 Phase 0b + Two-Tier Health Enhancements]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
- [[docs/architecture/backend-architecture#roon-websocket-client-rn1--real-time-zone-tracking|Roon WebSocket Client Documentation]]
