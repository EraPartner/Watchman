---
title: Service Monitoring
type: feature
status: active
date: 2026-04-09
tags: [feature, monitoring, backend, services]
description: Core service monitoring feature - health checks and statistics for self-hosted services
aliases: [monitoring, health checks, service status]
---

# Service Monitoring

> [!abstract] Overview
> Watchman's core feature is monitoring the health and statistics of self-hosted services through a unified interface.

## Architecture

### Service Pattern

Every service follows a standard interface:

```javascript
class ServiceName {
  constructor(config) {
    this.name = "service-name";
    this.config = config;
    this.enabled = this.checkConfig();
  }

  async checkHealth() {
    // Lightweight ping - returns { status, timestamp, data }
  }

  async getStats() {
    // Detailed metrics - returns { data, timestamp }
  }
}
```

### ServiceManager

The [[apps/backend/services/ServiceManager.js|ServiceManager]] orchestrates all services:

1. Reads `ENABLED_SERVICES` from environment
2. Initializes each service via factory pattern
3. Routes health/stats requests to appropriate service
4. Applies circuit breaker pattern for fault tolerance

### Health Check Flow

```
Frontend → GET /api/{service}/status
  → healthLimiter middleware
  → requireServiceEnabled middleware
  → healthCacheMiddleware (30s TTL)
  → ServiceManager.getServiceHealth()
  → Circuit breaker check
  → service.checkHealth()
  → Cache result
  → Return JSON response
```

### Stats Flow

```
Frontend → GET /api/{service}/stats
  → requireAuth middleware
  → statsCacheMiddleware (60s TTL)
  → ServiceManager.getServiceStats()
  → service.getStats()
  → Cache result
  → Return JSON response
```

## Supported Services

See [[docs/integrations/index|Service Integrations]] for per-service documentation.

## Caching

- **Health checks**: 30s TTL
- **Statistics**: 60s TTL
- Cache invalidation on write endpoints that mutate monitored state (for example, cache clear and AdGuard protection toggle)

## Circuit Breaker

Services use circuit breaker pattern to prevent cascading failures:

- **Failure threshold**: 5 consecutive failures
- **Reset timeout**: 30 seconds
- **Request timeout**: 5 seconds

## PlantUML Diagrams

### Health Check Flow

```plantuml
@startuml
!theme plain

actor "Frontend" as FE
participant "Backend" as BE
participant "Health Limiter" as RateLimit
participant "Service Enabled" as SvcEnabled
participant "Health Cache" as Cache
participant "ServiceManager" as SvcMgr
participant "Circuit Breaker" as CB
participant "Service" as Svc

FE -> BE : GET /api/{service}/status
BE -> RateLimit : Check rate limit
alt Rate Exceeded
    BE --> FE : 429 Too Many Requests
else OK
    BE -> SvcEnabled : Check service enabled
    alt Not Enabled
        BE --> FE : 404 Service Not Found
    else Enabled
        BE -> Cache : Check cache (30s TTL)
        alt Cache Hit
            Cache --> BE : Cached response
        else Cache Miss
            BE -> SvcMgr : getServiceHealth(serviceId)
            SvcMgr -> CB : Check circuit state
            alt Circuit Closed
                CB -> Svc : checkHealth()
                Svc --> CB : Result
                CB --> SvcMgr : Result
                SvcMgr -> Cache : Cache result
                SvcMgr --> BE : Result
            else Circuit Open
                CB --> SvcMgr : Error: Circuit Open
                SvcMgr --> BE : 503 Service Unavailable
            end
        end
        BE --> FE : JSON Response\n{status, timestamp, data}
    end
end
@enduml
```

### Stats Flow (Authenticated)

```plantuml
@startuml
!theme plain

actor "Frontend" as FE
participant "Backend" as BE
participant "Auth Middleware" as Auth
participant "Stats Cache" as Cache
participant "ServiceManager" as SvcMgr
participant "Service" as Svc

FE -> BE : GET /api/{service}/stats
BE -> Auth : Validate JWT
alt Invalid Token
    BE --> FE : 401 Unauthorized
else Valid Token
    BE -> Cache : Check cache (60s TTL)
    alt Cache Hit
        Cache --> BE : Cached response
    else Cache Miss
        BE -> SvcMgr : getServiceStats(serviceId)
        SvcMgr -> Svc : getStats()
        Svc --> SvcMgr : Result
        SvcMgr -> Cache : Cache result
        SvcMgr --> BE : Result
    end
    BE --> FE : JSON Response\n{data, timestamp}
end
@enduml
```

### Circuit Breaker State Machine

```plantuml
@startuml
!theme plain

[*] --> Closed : Initial state

state Closed {
    [*] --> Closed
    note "Normal operation" as n1
    Closed : Requests pass through
    Closed --> Open : 5 consecutive failures
}

state Open {
    [*] --> Open
    note "Service unavailable" as n2
    Open : Requests fail fast
    Open --> HalfOpen : 30 second timeout
}

state HalfOpen {
    [*] --> HalfOpen
    note "Testing recovery" as n3
    HalfOpen : Limited requests allowed
    HalfOpen --> Closed : Request succeeds
    HalfOpen --> Open : Request fails
}

Closed --> Closed : Success
@enduml
```

## Related

- [[docs/features/multi-instance|Multi-Instance Support]]
- [[docs/features/real-time-updates|Real-Time Updates]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/performance/caching-strategies|Caching Strategies]]
