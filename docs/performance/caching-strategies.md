---
title: Caching Strategies
type: performance
status: active
date: 2026-04-09
tags: [performance, caching, backend]
description: In-memory response caching strategies with TTL for the Watchman backend
aliases: [caching, cache, response cache, ttl]
---

# Caching Strategies

> [!abstract] Overview
> Watchman uses in-memory caching with TTL to reduce load on external services and improve response times.

## Implementation

[[apps/backend/middleware/cache.js|cache.js]]

Uses `node-cache` for in-memory caching.

## Cache Tiers

| Cache Type | TTL        | Applied To                        |
| ---------- | ---------- | --------------------------------- |
| Health     | 30 seconds | `/api/{service}/status` endpoints |
| Stats      | 60 seconds | `/api/{service}/stats` endpoints  |

## Middleware

| Middleware              | Purpose                       |
| ----------------------- | ----------------------------- |
| `healthCacheMiddleware` | Caches health check responses |
| `statsCacheMiddleware`  | Caches statistics responses   |
| `clearCache(type)`      | Clears cache by type or all   |

Behavior notes (from [[apps/backend/middleware/cache.js]]):

- Default cacheable methods are `GET` and `HEAD`
- Allowed methods are configurable via middleware `methods` option
- Middleware exits early (safe pass-through) when a cache key cannot be derived
- `X-Cache-TTL` reports remaining TTL in seconds (not epoch milliseconds)

## Cache Invalidation

Cache is cleared on control actions:

- After `POST /api/adguard/protection`
- After `POST /api/cache/clear`
- Manual cache clear endpoint

## Cache Key Strategy

Cache keys are derived from:

- Request path
- Query parameters
- Service identifier

## Considerations

- In-memory cache is per-process (not shared across instances)
- Cache size is unbounded (monitor in production)
- For multi-instance deployments, consider Redis

## PlantUML Diagrams

### Cache Flow

```plantuml
@startuml
!theme plain

actor "Frontend" as FE
participant "Backend" as BE
participant "Cache Middleware" as Cache
participant "Service" as Svc

FE -> BE : GET /api/{service}/status

BE -> Cache : Check cache key

alt Cache Hit
    Cache --> BE : Return cached response
    BE --> FE : JSON Response\n(x-cache: hit)
else Cache Miss
    BE -> Svc : Fetch from service
    Svc --> BE : Service response
    BE -> Cache : Store in cache (TTL)
    Cache --> BE : Success
    BE --> FE : JSON Response\n(x-cache: miss)
end
@enduml
```

### Cache TTL Expiration

```plantuml
@startuml
!theme plain

state "Cache Entry Lifecycle" as CLC {

    [*] --> Fresh : Request at t=0

    state Fresh {
        [*] --> Active : Entry created
        Active : Serving requests
    }

    state "TTL Timer" {
        [*] --> T30s : Health: 30s countdown
        T30s --> Expired : t > 30s

        [*] --> T60s : Stats: 60s countdown
        T60s --> Expired : t > 60s
    }

    Active --> T30s : Health request
    Active --> T60s : Stats request

    T30s --> Fresh : Request before expiry\n(reset timer)
    T60s --> Fresh : Request before expiry\n(reset timer)

    Expired --> [*] : Entry evicted
}

note right of Expired
  Next request causes
  fresh service fetch
end note
@enduml
```

### Cache Invalidation Events

```plantuml
@startuml
!theme plain

participant "Control Handler" as Handler
participant "Cache" as Cache
participant "Service" as Svc

alt AdGuard Protection Toggle
    Handler -> Svc : POST /api/adguard/protection
    Svc --> Handler : Success
    Handler -> Cache : clearCache('health')
    Handler -> Cache : clearCache('stats')

else Manual Clear
    Handler -> BE : POST /api/cache/clear
    BE -> Handler : Parse type parameter
    Handler -> Cache : clearCache(type or all)

else Time-Based Expiry
    note over Cache
      Entry TTL expires
    end note
    Cache -> Cache : Auto-evict
end

Cache --> Cache : All related\nentries cleared
@enduml
```

## Related

- [[docs/performance/index|Performance]]
- [[docs/performance/request-optimization|Request Optimization]]
