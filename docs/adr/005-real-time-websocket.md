---
title: ADR-005 - Real-Time Communication via WebSocket
type: adr
status: accepted
date: 2026-04-02
tags: [adr, architecture, backend, frontend, real-time]
description: WebSocket-based real-time updates with JWT authentication, heartbeat monitoring, and automatic reconnection
aliases: [websocket, real-time, live updates]
---

# ADR-005: Real-Time Communication via WebSocket

> [!abstract] Summary
> Real-time status updates use the `ws` library on the backend attached to the same HTTP server, with JWT authentication, heartbeat monitoring, and a frontend global singleton with automatic reconnection.

## Status

- **Status**: Accepted
- **Date**: 2026-04-02

## Context

Watchman monitors service health in real-time. Polling via REST API would create unnecessary load and introduce latency. A persistent bidirectional connection is needed for live status broadcasting.

## Decision

### Backend

- Uses `ws` library attached to the same HTTP server as the Express app
- Connections authenticated via JWT (extracted from Authorization header or cookies)
- Heartbeat monitoring (ping/pong) detects dead connections
- Connection limit per IP (default 5) prevents abuse
- `WebSocketManager` extends EventEmitter for event broadcasting

### Frontend

- Global singleton WebSocket instance prevents multiple connections across React re-renders
- Automatic reconnection with exponential backoff
- Max 5 reconnect attempts before requiring manual refresh
- WebSocket messages trigger batched/debounced React Query invalidations (150ms debounce)

### Key Code

- `[[apps/backend/services/WebSocketManager.js]]` - Backend WebSocket manager
- `[[apps/frontend/src/hooks/useWebSocket.ts]]` - Frontend WebSocket hook

## Consequences

### Positive

- Persistent bidirectional communication for live service status updates
- JWT auth on WebSocket reuses the same auth mechanism as REST API
- Heartbeat monitoring detects dead connections automatically
- Frontend global singleton prevents connection multiplicity issues
- React Query cache invalidation keeps UI in sync with backend state

### Negative

- Connection limit per IP may be low for legitimate multi-tab usage
- Max reconnect attempts of 5 means persistent network issues require manual intervention
- No WebSocket message persistence -- missed updates on disconnect are lost
- Backend WebSocketManager extends EventEmitter but event system is underutilized

### Risks

- WebSocket connections consume server resources even when idle
- No graceful handoff during server shutdown beyond a generic close message

## PlantUML Diagrams

### WebSocket Connection Architecture

```plantuml
@startuml
!theme plain

package "Backend" {
    [Express Server] as Express
    [WebSocketManager] as WSM
    [JWT Auth] as JWT
}

package "HTTP Server" {
    [HTTP Request] as HTTP
}

package "WebSocket Clients" {
    [Client 1] as C1
    [Client 2] as C2
    [Client N] as Cn
}

Express -> WSM : Initialize
HTTP -> WSM : Attach to same server

WSM -> JWT : Authenticate\n(extract from header)

C1 -> WSM : Connect\n(ws://host:port)
C2 -> WSM : Connect
Cn -> WSM : Connect

WSM -> C1 : Broadcast status updates
WSM -> C2 : Broadcast status updates
WSM -> Cn : Broadcast status updates

note right of WSM
  - JWT authentication
  - Heartbeat ping/pong
  - 5 connections per IP limit
  - EventEmitter for events
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
participant "WebSocketManager" as WSM
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

participant "ServiceManager" as SvcMgr
participant "WebSocketManager" as WSM
participant "Client 1" as C1
participant "Client 2" as C2
participant "React Query" as Query

note over SvcMgr
  Poll services every 15s
end note

SvcMgr -> SvcMgr : Poll services
SvcMgr -> SvcMgr : Compare status

alt Status Changed
    SvcMgr -> WSM : emit('status-update', data)

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
- Related code: `[[apps/backend/services/WebSocketManager.js]]`
- Related code: `[[apps/frontend/src/hooks/useWebSocket.ts]]`
