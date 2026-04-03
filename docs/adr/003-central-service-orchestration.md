---
title: ADR-003 - Central Service Orchestration via ServiceManager
type: adr
status: accepted
date: 2026-04-02
tags: [adr, architecture, backend, services]
description: ServiceManager acts as the central orchestrator for all service instances with circuit breaker integration
aliases: [service manager, orchestrator, service lifecycle]
---

# ADR-003: Central Service Orchestration via ServiceManager

> [!abstract] Summary
> A single `ServiceManager` class acts as the central orchestrator for all service instances, managing lifecycle, providing unified access methods, and wrapping health checks with circuit breakers.

## Status

- **Status**: Accepted
- **Date**: 2026-04-02

## Context

Watchman monitors 13+ different self-hosted services (AdGuard Home, Bitcoin, Tor, qBittorrent, etc.). Each service has its own class for health checks and stats. Without a central orchestrator, managing service lifecycle, aggregation, and error handling would be scattered across the codebase.

## Decision

A single `ServiceManager` class manages all service instances:

- Holds all services in a `Map` keyed by service name
- Provides unified access: `getService()`, `getServiceHealth()`, `getServiceStats()`
- Wraps every health check with circuit breaker protection (timeout: 5000ms, failureThreshold: 5, resetTimeout: 30000ms)
- Manages TorManager as a special dependency alongside services
- Enables the `/api/services/health` aggregate endpoint
- Provides ordered shutdown sequence

### Key Code

- `[[apps/backend/services/ServiceManager.js]]` - Central orchestrator
- `[[apps/backend/services/serviceFactoryConfig.js]]` - Service registry

## Consequences

### Positive

- Single point of control for service lifecycle management
- Circuit breaker integration is centralized -- every health check automatically gets protection
- Enables aggregate health endpoint that checks all services at once
- Consistent error handling across all services

### Negative

- ServiceManager holds all services in a single `Map` -- no hierarchical grouping by type
- Circuit breaker configuration is hardcoded per call rather than configurable per service
- Multi-instance support exists (`serviceInstances` Map) but current implementation only stores a single default instance per type

### Risks

- ServiceManager becomes a bottleneck if it grows too large
- Hardcoded circuit breaker values may not suit all services equally

## PlantUML Diagrams

### ServiceManager Architecture

```plantuml
@startuml
!theme plain

package "ServiceManager" {
    [services Map] as Services
    [serviceInstances Map] as Instances
    [getService] as GetSvc
    [getServiceHealth] as GetHealth
    [getServiceStats] as GetStats
}

package "Services" {
    [AdGuardService]
    [BitcoinService]
    [TorService]
    [QBittorrentService]
    [SynologyService]
    [RoonService]
    [PhilipsBridgeService]
    [HomebridgeService]
    [MacMiniService]
    [AlbyHubService]
    [RaspberryPiService]
    [RouterService]
}

package "Utilities" {
    [CircuitBreaker] as CB
    [TorManager] as TorMgr
}

Services --> GetSvc : Stores
Instances --> GetSvc : Stores

GetSvc --> GetHealth : Delegates
GetSvc --> GetStats : Delegates

GetHealth --> CB : Wraps each call
CB --> AdGuardService : Execute
CB --> BitcoinService : Execute
CB --> TorService : Execute
CB --> QBittorrentService : Execute
CB --> SynologyService : Execute

ServiceManager --> TorMgr : Manages

note right of CB
  Circuit Breaker:
  - Timeout: 5s
  - Failures: 5
  - Reset: 30s
end note
@enduml
```

### Service Lifecycle Management

```plantuml
@startuml
!theme plain

participant "Server Startup" as Start
participant "ServiceManager" as SM
participant "ServiceFactory" as Factory
participant "Service Instance" as Svc
participant "CircuitBreaker" as CB

Start -> SM : Initialize services

SM -> Factory : Get service configs

loop For each service config
    SM -> Factory : Create service instance
    Factory --> SM : Return service

    SM -> SM : services.set(name, instance)
    SM -> SM : instance.enabled = checkConfig()
end

note over SM
  All services initialized
  and ready for requests
end note

Start -> SM : Start polling interval
SM -> SM : setInterval(pollServices, 15000)

note over SM
  Services polled every 15s
  for real-time updates
end note
@enduml
```

### Health Check with Circuit Breaker

```plantuml
@startuml
!theme plain

participant "API Request" as API
participant "ServiceManager" as SM
participant "CircuitBreaker" as CB
participant "Service" as Svc
database "External Service" as Ext

API -> SM : getServiceHealth(serviceId)

alt Service Exists
    SM -> CB : Execute with circuit breaker

    state Closed {
        [*] --> Normal
        Normal : Requests execute
        Normal --> Open : 5 failures
    }

    state Open {
        [*] --> FastFail
        FastFail : Return 503 immediately
        FastFail --> HalfOpen : 30s timeout
    }

    state HalfOpen {
        [*] --> Testing
        Testing : Allow test request
        Testing --> Closed : Success
        Testing --> Open : Failure
    }

    alt Circuit Closed
        CB -> Svc : checkHealth()
        Svc -> Ext : HTTP/SSH
        Ext --> Svc : Response
        Svc --> CB : Result
        CB --> SM : Result
        SM --> API : Health response

    else Circuit Open
        CB --> SM : Error: Circuit Open
        SM --> API : 503 Service Unavailable
    end

else Service Not Found
    SM --> API : 404 Not Found
end
@enduml
```

## References

- [[docs/architecture/backend-architecture|Backend Architecture]]
- Related code: `[[apps/backend/services/ServiceManager.js]]`
- Related code: `[[apps/backend/services/serviceFactoryConfig.js]]`
