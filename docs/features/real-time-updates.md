---
title: Real-Time Updates
type: feature
status: active
date: 2026-04-19
tags: [feature, websocket, frontend, backend, real-time, fastify]
description: WebSocket-based real-time status broadcasting for live dashboard updates using split architecture
aliases: [websocket, real-time, live updates, status broadcasting]
---

# Real-Time Updates

> [!abstract] Overview
> Watchman uses WebSocket connections to broadcast service status changes to the frontend in real-time. The backend emits service status updates via EventBus; the frontend maintains a singleton WebSocket connection wrapped in a `<WebSocketProvider>` that invalidates React Query when messages arrive.

## Architecture

### Backend WebSocket Layer

The WebSocket layer is split into 4 classes in `[[apps/backend/src/transport/ws/]]`:

### AuthGate

Handles CORS and origin validation on WebSocket handshake upgrade. Rejects disallowed origins with code `1008`.

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

Publishes status changes to connected clients:
- Receives status-change events from domain layer via eventBus
- Serializes events to JSON message format
- Sends to all connected clients (or filtered by service type if needed)
- Handles send errors gracefully (disconnected clients don't crash broadcaster)

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
2. Message parsing and dispatch (recognizes `service_update`, `metrics`, `connection` message types)
3. Reconnection logic with exponential backoff (max 30 seconds)
4. Connection state tracking (connected/disconnecting/reconnecting)
5. Debounced React Query invalidation on service.stats.updated events (prevents thundering herd)
6. Error handling and recovery
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
- Frontend notification-state coverage now also includes [[apps/frontend/src/hooks/use-toast.test.tsx]] for [[apps/frontend/src/hooks/use-toast.ts]]:
  - reducer limit and dismiss-all behavior
  - hook lifecycle coverage for add/update/dismiss/remove transitions

## PlantUML Diagrams

### WebSocket Server Architecture

```plantuml
@startuml
!theme plain

package "HTTP Server" as HTTPServer {
    [Express Server] as Express
}

package "WebSocketManager" as WSMgr {
    [Server] as WS
    [Connection Tracker] as Tracker
    [Broadcast] as Broadcast
}

package "Clients" {
    [Client 1] as C1
    [Client 2] as C2
    [Client N] as Cn
}

Express --> WSMgr : Initialize
WSMgr --> Tracker : Track connections
WSMgr --> Broadcast : Broadcast messages

Tracker --> C1 : Store connection
Tracker --> C2 : Store connection
Tracker --> Cn : Store connection
@enduml
```

### Status Update Broadcasting

```plantuml
@startuml
!theme plain

participant "ServiceManager" as SvcMgr
participant "WebSocketManager" as WSMgr
participant "useWebSocket" as Hook
participant "React Query" as Query

note over SvcMgr : Poll interval: 15 seconds

loop Every 15 seconds
    SvcMgr -> SvcMgr : Poll all services
    SvcMgr -> SvcMgr : Compare with previous state

    alt Status Changed
        SvcMgr -> WSMgr : broadcast(statusUpdate)

        WSMgr -> Hook : WebSocket message
        Hook -> Hook : Parse update

        alt Service Health Update
            Hook -> Query : invalidateQueries\n(['service-health'])
        else Instance Config Update
            Hook -> Query : invalidateQueries\n(['service-instances'])
        end

        Query -> Query : Refetch affected queries
        Query --> Hook : Updated data
    else No Change
        SvcMgr -> SvcMgr : No action
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
participant "UI Components" as UI

Hook -> WS : Connect to ws://host:port
WS --> Hook : onOpen()
Hook -> Hook : Set connected state

alt Normal Operation
    WS -> Hook : onMessage(update)
    Hook -> Query : Invalidate relevant queries
    Query -> UI : Update state
else Connection Lost
    WS -> Hook : onClose()
    Hook -> Hook : Start reconnection\nwith exponential backoff

    loop Until Connected
        Hook -> WS : Attempt reconnect
        alt Success
            WS --> Hook : onOpen()
            Hook -> Hook : Reset backoff
        else Failed
            Hook -> Hook : Increase backoff\n(max 30 seconds)
        end
    end
end
@enduml
```

## Related

- [[docs/features/service-monitoring|Service Monitoring]]
- [[docs/architecture/data-flow|Data Flow]]
- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[apps/backend/src/transport/ws/AuthGate.ts|AuthGate]]
- [[apps/backend/src/transport/ws/ConnectionManager.ts|ConnectionManager]]
- [[apps/backend/src/transport/ws/HeartbeatScheduler.ts|HeartbeatScheduler]]
- [[apps/backend/src/transport/ws/Broadcaster.ts|Broadcaster]]
- [[apps/frontend/src/hooks/useWebSocket.ts|useWebSocket Hook]]
