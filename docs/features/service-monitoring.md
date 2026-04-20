---
title: Service Monitoring
type: feature
status: active
date: 2026-04-11
tags: [feature, monitoring, backend, services]
description: Core service monitoring feature - health checks and statistics for self-hosted services
aliases: [monitoring, health checks, service status]
---

# Service Monitoring

> [!abstract] Overview
> Watchman's core feature is monitoring the health and statistics of self-hosted services through a unified interface.

## Architecture

### Service Pattern

Every service extends `BaseService` (TypeScript, v2):

```typescript
export class ServiceName extends BaseService {
  readonly kind = "service-name";

  async checkHealth(): Promise<HealthResult> {
    // Lightweight ping
  }

  async getStats(): Promise<StatsResult> {
    // Detailed metrics
  }
}
```

See [[apps/backend/src/domain/BaseService.ts]] and [[apps/backend/src/domain/ServiceRegistry.ts]].

### BackgroundPoller

The `apps/backend/src/infra/scheduler/BackgroundPoller.ts` (BackgroundPoller) orchestrates all services:

1. Tracks registered services from `ServiceRegistry`
2. Polls each service on a configurable interval
3. Persists results to time-series store (DuckDB)
4. Applies circuit breaker pattern for fault tolerance

### Health Check Flow

```
Frontend → GET /services/{id}/health
  → Fastify route handler
  → BackgroundPoller cached result
  → Circuit breaker state
  → Return JSON { data: { status, ... } }
```

### Stats Flow

```
Frontend → GET /services/{id}/stats
  → Fastify route handler
  → SWR cache (TTL configurable)
  → service.getStats()
  → Return JSON { data: { ... } }
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

## Frontend Coverage Notes (Monitoring UI)

- Dashboard query-orchestration coverage in `apps/frontend/src/components/dashboard/useDashboardQueries.test.ts` for `apps/frontend/src/components/dashboard/useDashboardQueries.ts` now includes:
  - selective refetching for enabled service queries
  - always-refetched aggregate `servicesHealth`
  - expanded enablement branches for `frontendConfig` and `qbittorrent`
- Shared monitoring UI coverage now includes:
  - `apps/frontend/src/components/UpdateBadge.test.tsx` for update-check + click behavior in `apps/frontend/src/components/UpdateBadge.tsx`
  - [[apps/frontend/src/components/ServiceLink.test.tsx]] for host-only link display and click behavior in [[apps/frontend/src/components/ServiceLink.tsx]]
  - `apps/frontend/src/components/ServerStatusBadge.test.tsx` for status variant rendering in `apps/frontend/src/components/ServerStatusBadge.tsx`

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
