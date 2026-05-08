---
title: Data Flow
type: architecture
status: active
date: 2026-05-07
tags: [architecture, backend, frontend, data-flow, two-tier, health, websocket-snapshots, phase-0b, task-b5, event-subscription]
description: Data flow documentation for authentication, service monitoring (two-tier health model), real-time updates with full snapshot payloads, and Tor ControlPort event subscription lifecycle (Task B5)
aliases: [data flow, request flow, communication patterns]
---

# Data Flow

> [!abstract] Overview
> This document describes the primary data flows in Watchman: authentication, service monitoring with two-tier health model, and real-time updates.
>
> **Two-Tier Health Model** (Phase 0a): Each service check now runs ICMP ping and protocol probe in parallel, returning separate `host` and `service` tiers. See [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019]] Phase 0a.

## Authentication Flow

```
1. User submits credentials → POST /api/auth/login
2. Backend validates credentials (bcrypt hash comparison)
3. JWT access token generated
4. Token set as HTTP-only cookie with secure flags
5. CSRF token issued (double-submit cookie pattern)
6. Frontend stores auth state
7. Subsequent requests include JWT cookie automatically
8. CSRF token sent in request header for mutations
9. Middleware validates JWT on protected routes
10. CSRF middleware verifies token match
```

### Cookie Configuration

- `httpOnly: true` - Not accessible via JavaScript
- `secure: true` (production) - HTTPS only
- `sameSite: strict` (production) - CSRF protection
- `maxAge: 8 hours` - Session duration

## Service Monitoring Flow (Two-Tier Health)

```
1. Backend runs BackgroundPoller on healthMs interval
2. ServiceManager.getHealth(service) invokes service.checkHealth(signal)
3. Each service calls withHostPing() helper (new in Phase 0a):
   a. Promise.allSettled() runs in parallel:
      - ICMP ping to host via PingProber.probe()
      - Protocol probe (HTTP, RPC, SSH, etc.) via service-specific probe()
   b. Results assembled into HostHealth + ServiceHealth tiers
   c. Top-level reachable = AND/OR logic (service-dependent)
4. HealthSnapshot returned with host, service, and at timestamp
5. Frontend requests → GET /services/{kind}/health
6. Response cached (service-dependent TTL)
7. Frontend renders two indicator dots (host + service)
8. Tooltip shows host.pingMs + service.latencyMs + service.message
```

### Two-Tier Response Structure

```json
{
  "host": {
    "reachable": true,
    "pingMs": 12
  },
  "service": {
    "reachable": true,
    "latencyMs": 45,
    "message": "OK"
  },
  "reachable": true
}
```

- **host** — ICMP reachability (always attempted first)
- **service** — Protocol probe reachability (HTTP, RPC, SSH, etc.)
- **reachable** — Composite (semantics vary; HTTP services use `host AND service`, routers use `host OR service`)

### Stats Flow (requires auth)

```
1. Frontend requests stats → GET /api/{service}/stats
2. Auth middleware validates JWT
3. Cache middleware checks for cached response (60s TTL)
4. ServiceManager retrieves service instance
5. Service fetches detailed statistics
6. Response cached and returned
```

## Real-Time Updates Flow

```
1. Frontend loads → establishes WebSocket connection
2. ConnectionManager tracks connected clients
3. BackgroundPoller polls services on configured interval (15s)
4. Status change detected → eventBus emits service.stats.updated or service.health.updated
5. Broadcaster receives event with snapshot payload
6. Broadcaster sends WebSocket message to all connected clients with snapshot included
7. Frontend hook (useWebSocket) processes message
8. React Query cache invalidated
9. UI re-renders with updated status
```

### WebSocket Message Payload (Phase 0a+)

All `service_update` messages now include optional `snapshot` field:

```json
{
  "type": "service_update",
  "scope": "health" | "stats",
  "id": "bitcoin:main",
  "kind": "bitcoin",
  "instanceId": "main",
  "at": 1714000000000,
  "snapshot": { /* HealthSnapshot or StatsSnapshot if present */ }
}
```

- **snapshot** — Full `HealthSnapshot` or `StatsSnapshot` included when event is published; eliminates need for REST re-fetch on every WS event
- **scope** — "health" or "stats" to distinguish event type

## Configuration Flow

```
1. Backend starts → validateEnvironment()
2. Parse ENABLED_SERVICES from env
3. Parse multi-instance configurations
4. Initialize ServiceManager
5. Initialize TorManager (if tor enabled)
   - TorManager default data dir is `apps/backend/.tor-data`
   - Tor SOCKS readiness is determined via local TCP probe on `127.0.0.1:{socksPort}`
6. Initialize each service via factory pattern
   - Tor service receives TorEventSubscriptionFactory if useControlPort=true (Task B5)
7. Start background poller
   - For Tor ControlPort mode: onStart() creates event subscription for BW events (Task B5)
   - onStop() gracefully closes subscription on shutdown
8. Frontend requests config → GET /api/config/frontend
9. FrontendConfigService returns enabled services list
10. Frontend renders cards for enabled services
```

## PlantUML Diagrams

### Authentication Flow

```plantuml
@startuml
!theme plain

actor "User" as User
participant "Frontend" as FE
participant "Backend" as BE
participant "Auth Middleware" as Auth
database "Environment" as Env

User -> FE : Enter credentials
FE -> BE : POST /api/auth/login\n(username, password)
BE -> Auth : authenticateCredentials()
Auth -> Env : Read AUTH_USERNAME\nAUTH_PASSWORD_HASH
Env --> Auth : Return credentials
Auth -> Auth : bcrypt compare\n(timing attack prevention)
alt Credentials Valid
    Auth -> Auth : signToken(payload)
    Auth --> BE : JWT token
    BE -> BE : Set HTTP-only cookie\nSet CSRF cookie
    BE --> FE : 200 OK
    FE -> FE : Store auth state
else Credentials Invalid
    Auth --> BE : null
    BE --> FE : 401 Unauthorized
end
@enduml
```

### Service Monitoring Flow

```plantuml
@startuml
!theme plain

actor "Frontend" as FE
participant "Backend" as BE
participant "Rate Limiter" as RateLimit
participant "Cache" as Cache
participant "ServiceManager" as SvcMgr
participant "Circuit Breaker" as CB
participant "Service Class" as Svc
database "External Service" as ExtSvc

FE -> BE : GET /api/{service}/status
BE -> RateLimit : Check quota
alt Rate Limited
    BE --> FE : 429 Too Many Requests
else Within Limit
    BE -> Cache : Check cache (30s TTL)
    alt Cache Hit
        Cache --> BE : Cached response
    else Cache Miss
        BE -> SvcMgr : getServiceHealth(serviceId)
        SvcMgr -> CB : Check circuit state
        alt Circuit Closed
            CB -> Svc : checkHealth()
            Svc -> ExtSvc : HTTP/SSH request
            ExtSvc --> Svc : Response
            Svc --> CB : Result
            CB --> SvcMgr : Result
            SvcMgr -> Cache : Store in cache
            SvcMgr --> BE : Result
        else Circuit Open
            CB --> SvcMgr : Error: Circuit Open
            SvcMgr --> BE : 503 Service Unavailable
        end
    end
    BE --> FE : JSON Response
end
@enduml
```

### Real-Time Updates Flow

```plantuml
@startuml
!theme plain

participant "ServiceManager" as SvcMgr
participant "WebSocketManager" as WSMgr
participant "Client 1" as C1
participant "Client 2" as C2
participant "Client N" as Cn
participant "Frontend Hook" as Hook

note over SvcMgr : Polls services on interval

SvcMgr -> SvcMgr : Poll services
SvcMgr -> SvcMgr : Status change detected
SvcMgr -> WSMgr : broadcast(statusUpdate)
WSMgr -> C1 : send(statusUpdate)
WSMgr -> C2 : send(statusUpdate)
WSMgr -> Cn : send(statusUpdate)

C1 -> Hook : onMessage()
C2 -> Hook : onMessage()
Cn -> Hook : onMessage()

Hook -> Hook : Parse message
Hook -> Hook : Invalidate React Query cache
Hook -> Hook : Trigger re-render
@enduml
```

### Configuration Initialization Flow

```plantuml
@startuml
!theme plain

participant "Main" as Main
participant "Config" as Config
participant "ServiceManager" as SvcMgr
participant "ServiceFactory" as SvcFactory
participant "TorManager" as TorMgr
participant "FrontendConfigService" as FrontendCfg
database "Environment" as Env

Main -> Config : validateEnvironment()
Config -> Env : Read required vars
Env --> Config : Validation result
Config -> Config : getConfig()

Main -> SvcMgr : Initialize
SvcMgr -> SvcFactory : Get service configs
SvcFactory --> SvcMgr : Return configs

loop For each service
    SvcMgr -> SvcFactory : Create service instance
    SvcFactory --> SvcMgr : Service instance
end

alt Tor Enabled
    SvcMgr -> TorMgr : Initialize
end

Main -> FrontendCfg : Initialize

note over Main : Server ready\non port 3001
@enduml
```

## Related

- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/security/authentication|Authentication]]
