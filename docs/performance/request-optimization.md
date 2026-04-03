---
title: Request Optimization
type: performance
status: active
date: 2026-04-02
tags: [performance, frontend, optimization]
description: Frontend request batching and deduplication optimization
aliases: [request optimization, batching, deduplication, request optimizer]
---

# Request Optimization

> [!abstract] Overview
> Watchman frontend uses request optimization to batch and deduplicate API calls, reducing network overhead.

## Implementation

[[apps/frontend/src/services/RequestOptimizer.ts|RequestOptimizer.ts]]

### Features

- **Request Deduplication**: Identical concurrent requests are merged into a single API call
- **Request Batching**: Multiple health check requests can be batched together
- **Result Distribution**: All waiting callers receive the same response

## Architecture

```
Component A → RequestOptimizer ─┐
                                ├→ Single API call → Response → All callers
Component B → RequestOptimizer ─┘
```

## Usage

The `RequestOptimizer` wraps API client calls:

```typescript
const result = await requestOptimizer.execute(
  "service-health",
  { serviceId },
  () => apiClient.getServiceStatus(serviceId)
);
```

## Integration with Hooks

- `useServicesHealth` - Uses batching for multiple service health checks
- `useServiceHealth` - Uses deduplication for individual service checks

## WebSocket vs Polling

Watchman uses WebSocket for real-time updates to avoid polling:

- Frontend establishes WebSocket connection on load
- Backend broadcasts status changes automatically
- No periodic polling needed from frontend
- Reduces bandwidth and server load

## PlantUML Diagrams

### Request Deduplication

```plantuml
@startuml
!theme plain

participant "Component A" as A
participant "Component B" as B
participant "Component C" as C
participant "RequestOptimizer" as RO
participant "ApiClient" as API
participant "Backend" as BE

A -> RO : getStatus('adguard')
RO -> RO : Create pending promise

B -> RO : getStatus('adguard')
RO -> RO : Request in progress\nReturn same promise

C -> RO : getStatus('adguard')
RO -> RO : Request in progress\nReturn same promise

RO -> API : Single API call\nGET /api/adguard/status
API -> BE : Request
BE --> API : Response
API --> RO : Data

RO --> A : Data
RO --> B : Data
RO --> C : Data

note right of RO
  3 components served
  with 1 API call
end note
@enduml
```

### Request Batching

```plantuml
@startuml
!theme plain

participant "useServicesHealth" as Hook
participant "RequestOptimizer" as RO
participant "ApiClient" as API
participant "Backend" as BE

note over Hook
  Dashboard loads with
  14 service cards
end note

Hook -> RO : Batch health check request\n(services: all)

RO -> RO : Collect all service IDs\n(15ms debounce)

note right of RO
  Debounce window:
  Wait for other requests
  to batch together
end note

RO -> API : Batch request\nGET /api/services/health

API -> BE : Request
BE --> API : Combined response
API --> RO : All service statuses

RO --> Hook : Array of statuses
Hook -> Hook : Distribute to cards
@enduml
```

### WebSocket vs Polling Comparison

```plantuml
@startuml
!theme plain

skinparam noteBackgroundColor #FFFACD

note top of Polling
  POLLING APPROACH
end note

participant "Frontend" as FE1
participant "Backend" as BE1

loop Every 15 seconds
    FE1 -> BE1 : GET /api/adguard/status
    BE1 --> FE1 : Response
end

note top of WebSocket
  WEBSOCKET APPROACH
end note

participant "Frontend" as FE2
participant "WebSocketManager" as WSM
participant "Backend" as BE2

FE2 -> WSM : Connect (once)
WSM --> FE2 : Connection established

note over BE2
  Service status changes
end note

BE2 -> WSM : Status change detected
WSM -> FE2 : Push update (immediate)

note right of WebSocket
  Benefits:
  - No periodic requests
  - Immediate updates
  - Lower bandwidth
  - Less server load
end note
@enduml
```

## Related

- [[docs/performance/index|Performance]]
- [[docs/performance/caching-strategies|Caching Strategies]]
- [[docs/features/real-time-updates|Real-Time Updates]]
