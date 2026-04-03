---
title: "API: Cache Management"
type: api
status: active
date: 2026-04-02
tags: [api, cache, backend, endpoints]
description: POST /api/cache/clear - Response cache management endpoint
aliases: [cache clear, cache management, clear cache]
---

# Cache Management Endpoint

> [!abstract] Overview
> Clears the response cache for health checks, stats, or all cached responses. Requires authentication and CSRF verification.

## Endpoint

| Property   | Value                      |
| ---------- | -------------------------- |
| **Method** | `POST`                     |
| **Path**   | `/api/cache/clear`         |
| **Auth**   | Yes + CSRF                 |
| **Rate**   | `controlLimiter`           |
| **Source** | [[apps/backend/server.js]] |

## Request

```json
{
  "type": "health"
}
```

| Field  | Type     | Required | Description                                        |
| ------ | -------- | -------- | -------------------------------------------------- |
| `type` | `string` | No       | Cache type: `"health"`, `"stats"`, or omit for all |

### Validation

- If `type` is provided, it must be a non-empty string
- Empty string or non-string values return 400

## Response

### 200 OK

```json
{
  "success": true,
  "message": "Cache cleared: health"
}
```

### 400 Bad Request

```json
{
  "error": "Invalid cache type"
}
```

## Cache Types

| Type     | Description                 |
| -------- | --------------------------- |
| `health` | Health check response cache |
| `stats`  | Stats response cache        |
| _(none)_ | Clears all caches           |

## Behavior

- Cache is cleared immediately across all cache stores
- Used internally after AdGuard protection toggle to ensure fresh data
- Frontend can trigger manually for debugging

## Source

- Route: [[apps/backend/server.js]]
- Cache middleware: [[apps/backend/middleware/cache.js]]

## Related

- [[docs/performance/caching-strategies|Caching Strategies]]
- [[docs/api/index|API Index]]

## PlantUML Diagrams

### Cache Clear Flow

```plantuml
@startuml
!theme plain

actor "Frontend" as FE
participant "Backend" as BE
participant "Cache Middleware" as Cache
participant "Cache Store" as Store

FE -> BE : POST /api/cache/clear\n{type: "health"}
BE -> BE : Verify JWT + CSRF

BE -> Cache : clearCache('health')

Cache -> Store : Delete health cache\nkeys

Store --> Cache : Keys deleted
Cache --> BE : Success
BE --> FE : { success: true }
@enduml
```

### Cache Types

```plantuml
@startuml
!theme plain

database "Cache Store" as Cache {
    folder "health" as Health {
        [adguard_status]
        [bitcoin_status]
        [tor_status]
        [qbittorrent_1_status]
    }

    folder "stats" as Stats {
        [adguard_stats]
        [bitcoin_stats]
    }
}

note right of Health
  TTL: 30 seconds
end note

note right of Stats
  TTL: 60 seconds
end note
@enduml
```
