---
title: Real-Time Updates
type: feature
status: active
date: 2026-04-02
tags: [feature, websocket, frontend, backend, real-time]
description: WebSocket-based real-time status broadcasting for live dashboard updates
aliases: [websocket, real-time, live updates, status broadcasting]
---

# Real-Time Updates

> [!abstract] Overview
> Watchman uses WebSocket connections to broadcast service status changes to the frontend in real-time, eliminating the need for polling.

## Architecture

### WebSocketManager

The [[apps/backend/services/WebSocketManager.js|WebSocketManager]] handles:

1. WebSocket server initialization on HTTP server
2. Client connection management
3. Status change broadcasting
4. Graceful shutdown

### Data Flow

```
ServiceManager polls services (interval)
  → Status change detected
  → WebSocketManager.broadcast(statusUpdate)
  → All connected clients receive update
  → Frontend updates UI
```

### Frontend Integration

The [[apps/frontend/src/hooks/useWebSocket.ts|useWebSocket]] hook manages:

1. WebSocket connection establishment
2. Message parsing and dispatch
3. Reconnection logic
4. Connection state tracking

## Benefits

- **No polling overhead** - Frontend doesn't need to poll for updates
- **Immediate updates** - Status changes are pushed instantly
- **Reduced bandwidth** - Only changes are transmitted
- **Better UX** - Dashboard feels live and responsive

## Connection Lifecycle

1. Frontend loads → establishes WebSocket connection
2. ServiceManager polls services on configured interval
3. On status change → broadcast to all connected clients
4. Frontend receives update → re-renders affected components
5. On disconnect → automatic reconnection with backoff

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
- [[apps/backend/services/WebSocketManager.js|WebSocketManager]]
- [[apps/frontend/src/hooks/useWebSocket.ts|useWebSocket Hook]]
