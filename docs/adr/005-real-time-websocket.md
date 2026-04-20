---
title: ADR-005 - Real-Time Communication via WebSocket
type: adr
status: amended
date: 2026-04-09
amended_by: docs/adr/017-remove-authentication-frontend-v2-migration
amended_date: 2026-04-19
tags: [adr, architecture, backend, frontend, real-time]
description: WebSocket-based real-time updates with heartbeat monitoring and automatic reconnection (auth layer removed in v2.3)
aliases: [websocket, real-time, live updates]
---

# ADR-005: Real-Time Communication via WebSocket

> [!warning] Amended by ADR-017 and ADR-013
> Core decision (persistent WS for real-time updates) still stands. But the following details are stale and have been updated in this document:
> - **JWT authentication on WebSocket** — removed in v2.3 per [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]]. `AuthGate` now returns anonymous by default.
> - **Express → Fastify 4** — backend rewritten per [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]]. The `ws` library is now wrapped in a Fastify plugin.
> - **File path** — `apps/backend/services/WebSocketManager.js` → `apps/backend/src/transport/ws/wsPlugin.ts`.
> - **Connection limit** — 5 per IP → 10 per IP (current default in `wsPlugin.ts`).

> [!abstract] Summary
> Real-time status updates use the `ws` library wrapped in a Fastify plugin on the backend, with origin validation, heartbeat monitoring, and a frontend global singleton with automatic reconnection.

## Status

- **Status**: Amended
- **Amended by**: [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] (auth removed), [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] (Express → Fastify)
- **Date**: 2026-04-09
- **Amended date**: 2026-04-19

## Context

Watchman monitors service health in real-time. Polling via REST API would create unnecessary load and introduce latency. A persistent bidirectional connection is needed for live status broadcasting.

## Decision

### Backend

- Uses `ws` library wrapped in a Fastify plugin (`wsPlugin.ts`) attached to the same HTTP server
- Origin validation restricts connections to the `watchman://` Electron origin (anonymous by default)
- Heartbeat monitoring (ping/pong) detects dead connections
- Connection limit per IP (default 10) prevents abuse
- Plugin exposes broadcast helpers consumed by domain layers (poller, config writes) for status updates
- Disconnect handling is idempotent to avoid double-processing from close+error races
- Broadcast cleanup paths funnel stale sockets through disconnect handling so per-IP counters remain consistent

### Frontend

- Global singleton WebSocket instance prevents multiple connections across React re-renders
- Automatic reconnection with exponential backoff
- Max 5 reconnect attempts before requiring manual refresh
- WebSocket messages trigger batched/debounced targeted React Query invalidations (150ms debounce)
- Frontend hook logging for invalidation failures and flush summaries is routed through the frontend logger (`logger.warn`/`logger.debug`) to reduce console noise during normal message flow

### Key Code

- `[[apps/backend/src/transport/ws/wsPlugin.ts]]` - Backend Fastify WebSocket plugin
- `[[apps/frontend/src/hooks/useWebSocket.ts]]` - Frontend WebSocket hook

## Consequences

### Positive

- Persistent bidirectional communication for live service status updates
- Origin validation restricts connections to trusted Electron client (`watchman://`)
- Heartbeat monitoring detects dead connections automatically
- Frontend global singleton prevents connection multiplicity issues
- React Query cache invalidation keeps UI in sync with backend state

### Negative

- Connection limit per IP may be low for legitimate multi-tab usage
- Max reconnect attempts of 5 means persistent network issues require manual intervention
- No WebSocket message persistence -- missed updates on disconnect are lost
- Broadcast API relies on plugin-exposed helpers; domain events fan out through direct calls rather than a pub/sub abstraction

### Risks

- WebSocket connections consume server resources even when idle
- No graceful handoff during server shutdown beyond a generic close message

## PlantUML Diagrams

### WebSocket Connection Architecture

```plantuml
@startuml
!theme plain

package "Backend" {
    [Fastify Server] as Fastify
    [wsPlugin] as WSM
    [Origin Check] as Origin
}

package "HTTP Server" {
    [HTTP Upgrade] as HTTP
}

package "WebSocket Clients" {
    [Client 1] as C1
    [Client 2] as C2
    [Client N] as Cn
}

Fastify -> WSM : Register plugin
HTTP -> WSM : Attach to same server

WSM -> Origin : Validate origin\n(watchman://)

C1 -> WSM : Connect\n(ws://host:port)
C2 -> WSM : Connect
Cn -> WSM : Connect

WSM -> C1 : Broadcast status updates
WSM -> C2 : Broadcast status updates
WSM -> Cn : Broadcast status updates

note right of WSM
  - Origin validation
  - Heartbeat ping/pong
  - 10 connections per IP limit
  - Broadcast helpers for domain events
end note
@enduml
```

### WebSocket Lifecycle

```plantuml
@startuml
!theme plain

participant "Frontend" as FE
participant "useWebSocket" as Hook
participant "WebSocket" as WS
participant "React Query" as Query

FE -> Hook : Mount component
Hook -> WS : Connect()

note over WS
  Connection URL:
  ws://localhost:3001/ws
end note

WS -> WS : onOpen()
Hook -> Hook : Set connected = true

alt Normal Operation
    WS -> Hook : onMessage(update)
    Hook -> Hook : Parse message
    Hook -> Query : invalidateQueries()
    Query -> Query : Refetch data
    Query --> FE : Update UI

else Connection Lost
    WS -> Hook : onClose()
    Hook -> Hook : Start reconnect\n(exponential backoff)

    loop Max 5 attempts
        Hook -> WS : Connect()
        alt Success
            WS -> Hook : onOpen()
            Hook -> Hook : Reset attempt count
        else Failed
            Hook -> Hook : Increase backoff\n(max 30s)
        end
    end

    alt Max Attempts Reached
        Hook -> FE : Set connected = false
        FE -> FE : Show reconnect prompt
    end
end
@enduml
```

### Heartbeat Monitoring

```plantuml
@startuml
!theme plain

participant "Server" as Server
participant "wsPlugin" as WSM
participant "Client" as Client

Server -> WSM : Start heartbeat interval\n(every 30s)

WSM -> Client : Ping frame

alt Client Responds
    Client --> WSM : Pong frame
    WSM -> WSM : Reset failure count

else No Response (60s)
    WSM -> WSM : Increment failure count
    alt Failures >= 3
        WSM -> Client : Close connection
        WSM -> WSM : Remove from clients
    end
end
@enduml
```

### Message Broadcasting Flow

```plantuml
@startuml
!theme plain

participant "BackgroundPoller" as SvcMgr
participant "wsPlugin" as WSM
participant "Client 1" as C1
participant "Client 2" as C2
participant "React Query" as Query

note over SvcMgr
  Poll services every 15s
end note

SvcMgr -> SvcMgr : Poll services
SvcMgr -> SvcMgr : Compare status

alt Status Changed
    SvcMgr -> WSM : broadcast('service_update', data)

    WSM -> WSM : Serialize message

    WSM -> C1 : send(JSON)
    WSM -> C2 : send(JSON)

    C1 -> Query : invalidateQueries()
    C2 -> Query : invalidateQueries()

else No Change
    SvcMgr -> SvcMgr : No action
end
@enduml
```

## References

- [[docs/features/real-time-updates|Real-Time Updates]]
- [[docs/architecture/data-flow|Data Flow]]
- Related code: `[[apps/backend/src/transport/ws/wsPlugin.ts]]`
- Related code: `[[apps/frontend/src/hooks/useWebSocket.ts]]`
