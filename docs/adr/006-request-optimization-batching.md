---
title: ADR-006 - Request Optimization and Batching
type: adr
status: accepted
date: 2026-04-02
tags: [adr, performance, frontend, optimization]
description: Frontend request optimization through batching, deduplication, and offline queue for resilient dashboard loading
aliases: [request batching, request deduplication, offline sync]
---

# ADR-006: Request Optimization and Batching

> [!abstract] Summary
> The frontend implements request batching, in-flight request deduplication, and offline queue management to optimize API communication and provide resilience.

## Status

- **Status**: Accepted
- **Date**: 2026-04-02

## Context

The Watchman dashboard loads multiple service cards simultaneously, each potentially making health check and stats requests. Without optimization, this creates a burst of HTTP requests that can overwhelm the server and waste bandwidth.

## Decision

Three optimization strategies are implemented:

### 1. Request Batching (`RequestBatcher`)

- Batches multiple health check requests into a single `/api/services/health-batch` POST call
- Batch timeout: 100ms window to collect simultaneous requests
- Max batch size: 10 on frontend (backend supports up to 25)

### 2. In-Flight Request Deduplication (`ApiClient`)

- Tracks concurrent identical in-flight requests
- Returns the same promise to all callers requesting the same endpoint
- Prevents duplicate API calls from multiple components

### 3. Offline Queue (`BackgroundSync`)

- Queues requests when the browser detects offline status
- Replays queued requests when connectivity returns
- Persists queue to localStorage

### Key Code

- `[[apps/frontend/src/services/RequestOptimizer.ts]]` - Batching and deduplication
- `[[apps/frontend/src/services/ApiClient.ts]]` - API client with deduplication

## Consequences

### Positive

- Reduces HTTP request count when multiple service cards load simultaneously
- Prevents duplicate API calls from concurrent identical requests
- Provides resilience for intermittent connectivity
- Backend supports batch endpoint with input sanitization and max size limits

### Negative

- Batch timeout of 100ms is very short -- may not capture all simultaneous requests
- Background sync queue persists to localStorage but resolve/reject callbacks are not serializable
- Offline queue stores only URL, method, headers, and body -- no retry metadata or priority
- Frontend max batch size (10) is more restrictive than backend (25)

### Risks

- Lost promise resolvers on persisted offline queue items may cause silent failures
- No retry metadata means all queued requests are treated equally regardless of importance

## PlantUML Diagrams

### Request Batching Flow

```plantuml
@startuml
!theme plain

participant "Service Card A" as A
participant "Service Card B" as B
participant "Service Card C" as C
participant "RequestOptimizer" as RO
participant "Backend" as BE

A -> RO : request('/api/adguard/status')
RO -> RO : Create batch entry

B -> RO : request('/api/bitcoin/status')
RO -> RO : Add to batch (100ms window)

C -> RO : request('/api/tor/status')
RO -> RO : Add to batch

note over RO
  Batch window: 100ms
  Max size: 10 requests
end note

RO -> BE : POST /api/services/health-batch\n([adguard, bitcoin, tor])

BE --> RO : Combined response

RO --> A : adguard status
RO --> B : bitcoin status
RO --> C : tor status
@enduml
```

### Request Deduplication

```plantuml
@startuml
!theme plain

participant "Component A" as A
participant "Component B" as B
participant "ApiClient" as API

A -> API : GET /api/adguard/status
API -> API : Check in-flight map

alt No In-Flight Request
    API -> API : Create new promise
    API -> API : Store in in-flight map
    API -> API : Execute fetch
else Request In-Flight
    API --> A : Return existing promise
end

B -> API : GET /api/adguard/status
API -> API : Check in-flight map

note over API
  Same request detected
  Return same promise
end note

API --> B : Return existing promise

API -> API : Fetch completes
API -> API : Resolve all waiting promises
API -> API : Clear in-flight map

A -> A : Update with data
B -> B : Update with data

note right of API
  Result: 1 API call
  served to 2 components
end note
@enduml
```

### Offline Queue Architecture

```plantuml
@startuml
!theme plain

participant "App" as App
participant "OfflineQueue" as Queue
participant "localStorage" as Storage
participant "Network" as Net

note over App
  User is offline
end note

App -> Queue : POST /api/adguard/protection
Queue -> Queue : Detect offline\n(navigator.onLine = false)

Queue -> Queue : Create queue entry\n{url, method, headers, body}
Queue -> Storage : Store in localStorage

note right of Queue
  Queue entry:
  - URL and method
  - Headers
  - Body (JSON)
  - Timestamp
  - NOT: Promise callbacks
end note

App -> App : Continue offline operations

note over App
  Network restored
end note

App -> Queue : Trigger replay
Queue -> Storage : Load queue entries

loop For each entry
    Queue -> Net : Execute request

    alt Success
        Queue -> Storage : Remove entry
        Queue -> App : Resolve (silent)
    else Failure
        Queue -> Queue : Keep in queue
    end
end
@enduml
```

### Optimization Comparison

```plantuml
@startuml
!theme plain

skinparam rectangleBackgroundColor #FFFACD

rectangle "Without Optimization" as Without {
    rectangle "Card 1" as C1
    rectangle "Card 2" as C2
    rectangle "Card 3" as C3
    rectangle "Card N" as Cn
}

rectangle "With Optimization" as With {
    rectangle "RequestOptimizer" as RO
    rectangle "Batch + Dedupe" as Opt
}

Without --> With : After optimization

note right of Without
  14+ individual HTTP requests
  on dashboard load
end note

note right of With
  1 batched request
  + deduplication
  = ~2-3 requests total
end note
@enduml
```

## References

- [[docs/performance/request-optimization|Request Optimization]]
- [[docs/performance/index|Performance Overview]]
- Related code: `[[apps/frontend/src/services/RequestOptimizer.ts]]`
- Related code: `[[apps/frontend/src/services/ApiClient.ts]]`
