---
title: Real-Time Updates
type: feature
status: active
date: 2026-06-12
tags:
  [
    feature,
    websocket,
    frontend,
    backend,
    real-time,
    fastify,
    snapshots,
    phase-0a,
    alert-frames,
    origin-policy,
  ]
description: WebSocket-based real-time status broadcasting with full snapshot payloads (HealthSnapshot, StatsSnapshot), alert frames for error/recovery transitions, and shared origin policy
aliases: [websocket, real-time, live updates, status broadcasting]
---

# Real-Time Updates

> [!abstract] Overview
> Watchman uses WebSocket connections to broadcast service status changes to the frontend in real-time. The backend emits service status updates via EventBus; the frontend maintains a singleton WebSocket connection wrapped in a `<WebSocketProvider>` that invalidates React Query when messages arrive. The WebSocket layer is browser-compatible: the auth token is optional (browsers cannot set handshake headers), accepted from `Authorization: Bearer` or `?token=` query param.

## Architecture

### Backend WebSocket Layer

The WebSocket layer is split into 4 classes in `[[apps/backend/src/transport/ws/]]`:

### AuthGate

Validates the WebSocket upgrade request. Uses the **shared origin allow-list** from [[apps/backend/src/transport/originPolicy.ts|originPolicy.ts]] (same policy as HTTP CORS). Rejects disallowed origins with close code `1008`. Auth token is **optional** — browsers cannot set handshake headers, so an unauthenticated upgrade is accepted as `anonymous`. Token is extracted from `Authorization: Bearer <token>` or `?token=<token>` query param when present.

### ConnectionManager

Manages active client connections:

- Track each connection with unique ID
- Track IP address per connection (for rate limiting, security alerts)
- Clean up disconnected clients (idempotent handling)
- Prevent double-processing on close/error

### HeartbeatScheduler

Maintains connection liveness:

- Sends ping messages every 30 seconds
- Tracks pong responses
- Closes stale connections (no pong after 2 pings)
- Graceful shutdown of all heartbeat intervals
- **Snapshot iteration**: Creates a snapshot via spread (`[...manager.entries()]`) to prevent breakage if the underlying connection view becomes live (e.g., concurrent add/remove during iteration)

### Broadcaster

Publishes status changes and alert transitions to connected clients:

- Subscribes to `service.health.updated`, `service.stats.updated`, `service.error`, and `config:service.*` events from the EventBus
- Includes full `snapshot` (HealthSnapshot or StatsSnapshot) in `service_update` payload when present (Phase 0a+)
- **Alert frames** — deduped on state transitions: emits `{ type: "alert", level: "error" }` on a service's **first** poll failure (`service.error`); emits `{ type: "alert", level: "info", message: "…recovered" }` on the next successful poll. Subsequent failures while already errored are suppressed until recovery clears the set.
- Serializes all events to JSON before sending
- Handles send errors gracefully (dead clients are removed, not crashed on)

### Data Flow

```
BackgroundPoller polls services (15s interval, croner-based)
  → Status change detected
  → Emits event to eventBus
  → Broadcaster receives event
  → Sends WebSocket message to all connected clients
  → Frontend useWebSocket hook invalidates React Query
  → Components re-render with updated data
```

### Frontend Integration

**WebSocket Provider Pattern:**

The [[apps/frontend/src/providers/WebSocketProvider.tsx|WebSocketProvider]] wraps the entire React tree and manages a singleton WebSocket connection:

1. **Singleton Connection** — Mounts exactly once (via context + hook)
2. **Connection State** — Exposes `isConnected` and `reconnectAttempts` via `useWebSocketContext()`
3. **Raw Events** — Provides `useWebSocketEvent(type)` hook for consuming specific message types

**Hook-Level Details:**

The [[apps/frontend/src/hooks/useWebSocket.ts|useWebSocket]] hook manages:

1. WebSocket connection establishment (upgrade to `/ws` endpoint)
2. Message parsing and dispatch — recognizes `service_update`, `alert`, `metrics`, `connection`, `service_config_changed` message types
3. `service_update` cache invalidation: keyed by `kind` using prefix invalidation (`[kind, ...]`), so all query families for that kind are invalidated in a single debounced batch
4. `alert` frames: routed to toast notifications (`error` → `toast.error`, `warning` → `toast.warning`, `info` → `toast.info`)
5. Reconnection logic with exponential backoff (max 30 seconds); reconnect attempts counted **once per failure** via `onclose` only (not double-counted from `onerror`)
6. Connection toast only on **recovery** (`toast.success("WebSocket reconnected")`), not on every initial connect
7. Hook-level observability via frontend logger (`logger.warn`/`logger.debug`)

## Benefits

- **No polling overhead** - Frontend doesn't need to poll for updates
- **Immediate updates** - Status changes are pushed instantly
- **Reduced bandwidth** - Only changes are transmitted
- **Better UX** - Dashboard feels live and responsive

## Connection Lifecycle

1. Frontend loads → `useWebSocket` hook initializes
2. Establishes WebSocket upgrade to `/ws` endpoint (via AuthGate)
3. ConnectionManager registers client connection
4. HeartbeatScheduler starts ping/pong keep-alives
5. BackgroundPoller runs on 15s interval, emits status changes
6. Broadcaster sends updates to all connected clients
7. Frontend receives message → React Query invalidates
8. Components re-render with fresh data from cache/API
9. On disconnect → HeartbeatScheduler stops, ConnectionManager cleans up
10. Frontend hook attempts reconnection with exponential backoff

## Test Coverage Notes

- Frontend WebSocket message-handling coverage includes [[apps/frontend/src/hooks/useWebSocket.test.tsx]] for [[apps/frontend/src/hooks/useWebSocket.ts]]:
  - batched/deduped `service_update` invalidation behavior
  - alert-level toast routing (`error`/`warning`/`info`)
  - unknown message-type warning path
  - send-error handling when socket send fails despite an open-state call path
  - unmount-time invalidation flush for queued service updates
  - tor/router invalidation family behavior (`queryKeys.torRelay()` and `queryKeys.routerArp(...)`)
  - metrics invalidation and `connection` message toast behavior
  - max reconnect attempts error path and reconnect terminal-state handling
  - cleanup stability for singleton WebSocket state across tests
- Frontend notification-state coverage now also includes `apps/frontend/src/hooks/use-toast.test.tsx` for `apps/frontend/src/hooks/use-toast.ts`:
  - reducer limit and dismiss-all behavior
  - hook lifecycle coverage for add/update/dismiss/remove transitions

## PlantUML Diagrams

### WebSocket Server Architecture

```plantuml
@startuml
!theme plain

package "Fastify Server" as HTTPServer {
    [wsPlugin (/ws upgrade)] as WsPlugin
}

package "Transport WS" as WSLayer {
    [AuthGate\n(origin policy + optional token)] as Gate
    [ConnectionManager\n(client registry)] as Tracker
    [HeartbeatScheduler\n(ping/pong 30s)] as HB
    [Broadcaster\n(event → frame)] as Broadcast
}

package "EventBus" as Bus {
    [service.health.updated] as HE
    [service.stats.updated] as SE
    [service.error] as ERR
    [config:service.*] as CFG
}

package "Clients" {
    [Browser / Desktop] as C1
    [CLI / script\n(no Origin header)] as C2
}

WsPlugin --> Gate : upgrade request
Gate --> Tracker : accepted connection
Tracker --> HB : register
HB --> Broadcast : liveness

HE --> Broadcast : health frame
SE --> Broadcast : stats frame
ERR --> Broadcast : alert frame\n(first failure only)
CFG --> Broadcast : config_changed frame

Broadcast --> C1 : JSON frames
Broadcast --> C2 : JSON frames
@enduml
```

### Status Update Broadcasting

```plantuml
@startuml
!theme plain

participant "BackgroundPoller" as Poller
participant "EventBus" as Bus
participant "Broadcaster" as Bcast
participant "useWebSocket" as Hook
participant "React Query" as Query
participant "Toast" as Toast

note over Poller : 15-second interval

loop Every 15 seconds
    Poller -> Poller : Poll service

    alt Poll succeeds
        Poller -> Bus : service.health.updated\nor service.stats.updated
        Bus -> Bcast : event payload
        Bcast -> Bcast : clear erroredIds\n(recovery check)
        Bcast -> Hook : service_update frame\n{type,scope,id,kind,snapshot}
        Hook -> Query : invalidateQueries\n([kind, ...]) prefix match
        Query -> Query : Refetch affected queries

        note over Bcast : if id was in erroredIds\nemit alert "recovered" first
    else Poll fails (first failure)
        Poller -> Bus : service.error {id,kind,scope,error}
        Bus -> Bcast : error payload
        Bcast -> Bcast : add id to erroredIds
        Bcast -> Hook : alert frame\n{type:"alert",level:"error"}
        Hook -> Toast : toast.error(message)
    else Poll fails (repeat failure)
        Poller -> Bus : service.error
        Bus -> Bcast : error payload
        note over Bcast : id already in erroredIds\nsuppressed
    end
end
@enduml
```

### Client Connection Lifecycle

```plantuml
@startuml
!theme plain

participant "useWebSocket Hook" as Hook
participant "WebSocket" as WS
participant "React Query" as Query
participant "Toast" as Toast

Hook -> WS : Connect to ws://host/ws
WS --> Hook : onopen()
Hook -> Hook : reconnectAttempts > 0?\nyes → toast.success("WebSocket reconnected")
Hook -> Hook : reset reconnectAttempts

alt Normal Operation
    WS -> Hook : onmessage(frame)
    Hook -> Hook : parse JSON

    alt service_update
        Hook -> Query : debounced prefix invalidate\n[kind, ...]
    else alert
        Hook -> Toast : toast.error/warning/info
    else connection / metrics / config_changed
        Hook -> Query : invalidate specific keys
    end
else Connection Lost
    WS -> Hook : onclose()
    Hook -> Hook : increment reconnectAttempts\n(counted once per close, not per error)
    Hook -> Hook : schedule reconnect\n(exponential backoff, max 30s)

    loop Until connected or max attempts
        Hook -> WS : new WebSocket(url)
        alt Success
            WS --> Hook : onopen()
            Hook -> Toast : toast.success("WebSocket reconnected")
        else Failed
            Hook -> Hook : increase backoff
        end
    end
end
@enduml
```

## Related

- [[docs/features/service-monitoring|Service Monitoring]]
- [[docs/architecture/data-flow|Data Flow]]
- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/architecture/core-systems|Core Systems — EventBus]]
- [[docs/security/index|Security — Origin Policy]]
- [[apps/backend/src/transport/originPolicy.ts|originPolicy.ts]] — shared origin allow-list
- [[apps/backend/src/transport/ws/AuthGate.ts|AuthGate]]
- [[apps/backend/src/transport/ws/ConnectionManager.ts|ConnectionManager]]
- [[apps/backend/src/transport/ws/HeartbeatScheduler.ts|HeartbeatScheduler]]
- [[apps/backend/src/transport/ws/Broadcaster.ts|Broadcaster]]
- [[apps/frontend/src/hooks/useWebSocket.ts|useWebSocket Hook]]
