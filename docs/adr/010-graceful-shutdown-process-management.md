---
title: ADR-010 - Graceful Shutdown and Process Management
type: adr
status: superseded
date: 2026-04-02
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [adr, backend, reliability, deployment]
description: Ordered graceful shutdown handling for HTTP server, WebSocket, services, and resources with signal-based triggering
aliases: [graceful shutdown, process management, signal handling]
---

# ADR-010: Graceful Shutdown and Process Management

> [!danger] Superseded by ADR-013 — No Longer Implemented
> This document describes **v1 shutdown handling** (Express.js/JavaScript). The backend was rewritten to TypeScript + Fastify 4 in v2.0; shutdown is handled via Fastify's built-in lifecycle hooks (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]]). Content retained for archival reference only.

> [!abstract] Summary
> The backend implements comprehensive graceful shutdown handling for SIGINT, SIGTERM, uncaught exceptions, and unhandled rejections with ordered resource cleanup.

## Status

- **Status**: Superseded
- **Superseded by**: [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]]
- **Date**: 2026-04-02
- **Superseded date**: 2026-04-20

## Context

Watchman runs as a long-lived process managing HTTP connections, WebSocket connections, and service health checks. During deployments or system restarts, resources need to be cleaned up properly to prevent data loss, orphaned connections, and resource leaks.

## Decision

Graceful shutdown is triggered by:

- `SIGINT` (Ctrl+C)
- `SIGTERM` (kill command, container orchestrators)
- Uncaught exceptions (production only)
- Unhandled promise rejections (production only)

### Shutdown Sequence (ordered)

1. **Stop accepting new HTTP connections** - HTTP server stops listening
2. **Shutdown WebSocket server** - Close all WebSocket connections with "Server shutting down" message
3. **Shutdown ServiceManager** - Clean up all service instances and circuit breakers
4. **Destroy HTTP agents** - Release keep-alive connections
5. **Shutdown performance monitor** - Stop metrics collection

### Configuration

- 10-second timeout on HTTP server close prevents indefinite hanging
- Production vs. development behavior differs: production does graceful shutdown, development exits immediately

### Key Code

- `[[apps/backend/server.js]]` - Signal handlers and shutdown sequence

## Consequences

### Positive

- Prevents data loss and connection drops during deployments
- Ordered cleanup ensures dependent resources are released in the correct order
- Timeout prevents indefinite hanging on stuck connections
- Signal-based triggering works with container orchestrators (Docker, Kubernetes)

### Negative

- In-flight requests are not waited for -- HTTP server just stops accepting new connections
- WebSocket clients receive a generic close message with no graceful handoff
- Uncaught exceptions trigger shutdown in production -- may be too aggressive for recoverable errors

### Risks

- Long-running health checks may be interrupted mid-flight
- WebSocket clients may not handle the abrupt close gracefully

## PlantUML Diagrams

### Shutdown Sequence

```plantuml
@startuml
!theme plain

participant "Signal (SIGINT/SIGTERM)" as Signal
participant "HTTP Server" as HTTP
participant "WebSocket Manager" as WS
participant "Service Manager" as SM
participant "Performance Monitor" as PM

Signal -> HTTP : Stop accepting connections
HTTP --> Signal : No longer listening

Signal -> WS : Shutdown WebSocket
WS -> WS : Close all connections\n"Server shutting down"
WS --> Signal : WebSockets closed

Signal -> SM : Shutdown services
SM -> SM : Cleanup circuit breakers
SM -> SM : Close service connections
SM --> Signal : Services cleaned up

Signal -> HTTP : Destroy HTTP agents
HTTP --> Signal : Agents destroyed

Signal -> PM : Stop monitoring
PM --> Signal : Monitor stopped

note right of Signal
  10 second timeout
  prevents indefinite hang
end note
@enduml
```

### Signal Handling Flow

```plantuml
@startuml
!theme plain

state "Running" as Running {
    [*] --> Active
    Active : Accepting requests
    Active : Health checks polling
    Active : WebSocket connections
}

state "Shutting Down" as Shutting {
    [*] --> StopListening
    StopListening : No new connections
    StopListening --> CloseWebSockets

    CloseWebSockets : Send close message
    CloseWebSockets --> CleanupServices

    CleanupServices : Stop health checks
    CleanupServices --> CleanupResources

    CleanupResources : Close connections
    CleanupResources --> [*]
}

Running --> Shutting : SIGINT / SIGTERM

note right of Running
  Normal operation
end note

note right of Shutting
  Graceful shutdown
  sequence
end note
@enduml
```

### Production vs Development Behavior

```plantuml
@startuml
!theme plain

participant "Uncaught Exception" as Ex
participant "Development" as Dev
participant "Production" as Prod

Ex -> Dev : Error occurs
Dev -> Dev : Check NODE_ENV

alt Development
    Dev -> Dev : Log error
    Dev -> Dev : Exit immediately
else Production
    Prod -> Prod : Log error (HIGH severity)
    Prod -> Prod : Trigger graceful shutdown
    Prod -> Prod : Wait for resources\n(max 10s)
    Prod -> Prod : Exit with code 1
end
@enduml
```

### Process Lifecycle

```plantuml
@startuml
!theme plain

participant "Container/PM" as Orch
participant "Watchman Process" as Proc

Orch -> Proc : SIGTERM / SIGINT

note over Proc
  Graceful shutdown
  initiated
end note

Proc -> Proc : 1. Stop HTTP listener
Proc -> Proc : 2. Close WebSockets
Proc -> Proc : 3. Cleanup services
Proc -> Proc : 4. Close connections

Proc --> Orch : Exit code 0 (success)

note right of Orch
  Container orchestrator
  can now restart/recreate
end note

alt Health Check Running
    Proc -> Proc : Timeout after 10s
    Proc --> Orch : Exit (forced)
end
@enduml
```

## References

- [[docs/architecture/backend-architecture|Backend Architecture]]
- Related code: `[[apps/backend/server.js]]`
