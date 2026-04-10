---
title: ADR-007 - API Client with Retry and Error Handling
type: adr
status: accepted
date: 2026-04-10
tags: [adr, frontend, architecture, error-handling]
description: Singleton API client with exponential backoff retry, request deduplication, CSRF injection, and standardized error handling
aliases: [api client, retry logic, error handling]
---

# ADR-007: API Client with Retry and Error Handling

> [!abstract] Summary
> A singleton `ApiClient` class provides typed methods for every backend endpoint with idempotent-method retry, in-flight deduplication, AbortController timeouts, and CSRF token injection.

## Status

- **Status**: Accepted
- **Date**: 2026-04-02

## Context

Multiple React components need to communicate with the backend API. Without a centralized client, each component would implement its own error handling, retry logic, and authentication -- leading to inconsistency and duplicated code.

## Decision

A singleton `ApiClient` class provides:

- **Typed methods** for every backend endpoint (health, stats, auth, service control)
- **Automatic retry for idempotent methods only (`GET`/`HEAD`)** with exponential backoff + jitter (up to 3 attempts)
  - Retryable status codes: 408, 429, 500, 502, 503, 504
- **In-flight request deduplication** - concurrent identical requests share the same promise
- **AbortController-based timeouts** - prevents hanging requests
- **CSRF token injection** - automatically adds CSRF token to POST/PUT/PATCH/DELETE requests
- **Response unwrapping** via `unwrapApiResponse` for standardized response envelope
- **Auth token compatibility fallback** is in-memory only (set when backend returns deprecated body token)
- **Typed in-flight dedup map** based on `Promise<unknown>` (no `Promise<any>` in request dedup internals)
- **Compatibility alias methods** for Homebridge endpoints delegate to canonical client methods to keep call sites stable during cleanup
  - `getHomebridgeStatus()`, `getHomebridgeStats()`, and `getStatusHomebridge()` are marked deprecated and delegate to `getHomebridgeServerInformation()`
- **Header defaulting hygiene** applies `Content-Type: application/json` automatically only for non-`GET`/`HEAD` requests unless explicitly provided
- **Additional exported response interfaces/types** are available for consuming hooks/components (for example auth, services-health, frontend-config, and service-instance response shapes)

### Key Code

- `[[apps/frontend/src/services/ApiClient.ts]]` - stable public API client surface
- `[[apps/frontend/src/services/apiClient/core.ts]]` - request pipeline (retry, timeout, dedup, headers, CSRF/auth header injection)
- `[[apps/frontend/src/services/apiClient/endpoints.ts]]` - endpoint method layer
- `[[apps/frontend/src/services/apiClient/types.ts]]` - exported API types/interfaces

## Consequences

### Positive

- Centralized API client ensures consistent error handling across all components
- In-flight deduplication prevents race conditions from concurrent requests
- Retry with jitter handles transient network issues gracefully
- Restricting retries to `GET`/`HEAD` avoids replaying non-idempotent writes
- CSRF token automatically added to state-changing requests
- In-memory compatibility token avoids persistence risks from browser storage

### Negative

- Each endpoint has a dedicated method -- adding new endpoints requires modifying the client class
- Response unwrapping assumes a standardized response envelope from the backend
- Compatibility-mode body token still exists and should remain disabled unless required by legacy clients
- No request caching -- every call goes to the server (caching handled by React Query)

### Risks

- Client class becomes large as endpoints are added
- Compatibility body-token mode (`AUTH_RETURN_TOKEN=true`) increases bearer-token exposure in frontend runtime

## PlantUML Diagrams

### ApiClient Architecture

```plantuml
@startuml
!theme plain

package "ApiClient" {
    [Singleton Instance] as Instance
    [get(), post(), put(), delete()] as Methods
    [Retry Logic] as Retry
    [Deduplication] as Dedup
    [CSRF Injection] as CSRF
    [Timeout Handler] as Timeout
}

package "Request Pipeline" {
    [Component] as Comp
    [ApiClient] as API
    [Fetch] as Fetch
    [Retry with Backoff] as Backoff
}

Comp -> API : Call method
API -> Dedup : Check in-flight

alt Duplicate Request
    Dedup --> Comp : Return shared promise
else New Request
    API -> CSRF : Add CSRF token
    API -> Timeout : Set AbortController
    API -> Retry : Execute with retry

    Retry -> Fetch : fetch()

    alt Success
        Fetch --> Retry : Response
        Retry --> API : Data
        API --> Comp : Result
    else Retryable Error
        Retry -> Retry : Wait with backoff
        Retry -> Retry : Retry (max 3)
    end
end
@enduml
```

### Retry with Exponential Backoff

```plantuml
@startuml
!theme plain

participant "ApiClient" as API
participant "Fetch" as Fetch

API -> Fetch : Initial request

alt Success
    Fetch --> API : 200 OK
    API --> API : Return data
else Retryable Error (5xx, 429, 408)
    API -> API : Calculate backoff\n(2^n * 1000ms + random jitter)

    note right of API
      Retry delays:
      1st: 1s + jitter
      2nd: 2s + jitter
      3rd: 4s + jitter
    end note

    API -> API : Wait backoff delay

    alt Attempts < 3
        API -> Fetch : Retry request
    else Max Attempts
        API --> API : Throw error
    end
end

note right of API
  Retryable status codes:
  408, 429, 500, 502, 503, 504
end note
@enduml
```

### Request Deduplication Flow

```plantuml
@startuml
!theme plain

participant "Component A" as A
participant "Component B" as B
participant "ApiClient" as API
participant "Promise Map" as Map

A -> API : getServiceStatus('adguard')

API -> Map : Check 'adguard' key

alt Key Not Present
    Map -> Map : Create new Promise
    Map --> API : Promise
    API -> API : Execute fetch
    API -> A : Return promise
else Key Present
    Map --> API : Existing promise
    API -> B : Return same promise

    note right of API
      Both components receive
      the same Promise object
    end note
end

B -> API : getServiceStatus('adguard')

API -> A : Resolve promise
API -> B : Resolve promise (same data)
@enduml
```

### CSRF Token Injection

```plantuml
@startuml
!theme plain

participant "Component" as Comp
participant "ApiClient" as API
participant "CSRF Store" as Store

Comp -> API : POST /api/adguard/protection

API -> Store : Get CSRF token

alt Token in Cookie
    Store --> API : Return token
else Token Not Found
    API -> API : Throw error\n"No CSRF token"
end

API -> API : Inject header\nX-CSRF-Token: <token>

API -> API : Execute fetch

note right of API
  Only POST/PUT/PATCH/DELETE
  get CSRF token injected
end note
@enduml
```

## References

- [[docs/components/index|Frontend Components]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- Related code: `[[apps/frontend/src/services/ApiClient.ts]]`, `[[apps/frontend/src/services/apiClient/core.ts]]`, `[[apps/frontend/src/services/apiClient/endpoints.ts]]`, `[[apps/frontend/src/services/apiClient/types.ts]]`
