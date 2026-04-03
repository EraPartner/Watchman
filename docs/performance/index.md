---
title: Performance
type: index
status: active
date: 2026-04-02
tags: [performance, index]
description: Index of all performance optimization documentation for the Watchman project
aliases: [performance index, optimizations, performance docs]
---

# Performance

> [!abstract] Overview
> Watchman implements several performance optimizations to ensure responsive monitoring dashboard.

## Performance Index

```dataview
TABLE WITHOUT ID file.link AS "Document", date AS "Date", status AS "Status"
FROM "docs/performance"
WHERE type = "performance"
SORT file.name ASC
```

## Documents

| Document                                | Description            |
| --------------------------------------- | ---------------------- | ------------------------------------------- |
| [[docs/performance/caching-strategies   | Caching Strategies]]   | In-memory response caching with TTL         |
| [[docs/performance/request-optimization | Request Optimization]] | Frontend request batching and deduplication |

## Optimization Summary

| Technique         | Layer    | Description                                |
| ----------------- | -------- | ------------------------------------------ |
| Response caching  | Backend  | In-memory cache with 30s/60s TTL           |
| Request batching  | Frontend | Deduplicates concurrent identical requests |
| WebSocket updates | Both     | Eliminates polling overhead                |
| Compression       | Backend  | gzip compression for responses             |
| Circuit breaker   | Backend  | Prevents cascading failures                |
| Request timeout   | Backend  | Prevents hanging requests                  |

## Related

- [[docs/architecture/index|Architecture]]
- [[docs/features/real-time-updates|Real-Time Updates]]

## PlantUML Diagrams

### Performance Optimization Layers

```plantuml
@startuml
!theme plain

package "Frontend" as FE {
    [Request Batching]
    [Deduplication]
    [WebSocket Updates]
}

package "Backend" as BE {
    [Response Caching]
    [Compression]
    [Circuit Breaker]
    [Request Timeout]
}

package "Network" as Net {
    [gzip]
    [Rate Limiting]
}

FE --> BE : API Requests
BE --> Net : Optimized responses

note right of FE
  - Batch requests
  - Deduplicate
  - WebSocket for updates
end note

note right of BE
  - 30s health cache
  - 60s stats cache
  - Circuit breaker
end note
@enduml
```

### Caching Architecture

```plantuml
@startuml
!theme plain

participant "Request" as Req
participant "Cache Middleware" as Cache
participant "Service" as Svc

Req -> Cache : Request

alt Cache Hit
    Cache --> Req : Return cached\n(x-cache: hit)
else Cache Miss
    Cache -> Svc : Fetch from service
    Svc --> Cache : Response
    Cache -> Cache : Store with TTL
    Cache --> Req : Response\n(x-cache: miss)
end

note right of Cache
  Health: 30s TTL
  Stats: 60s TTL
end note
@enduml
```
