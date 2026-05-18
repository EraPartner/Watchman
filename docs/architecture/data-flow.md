---
title: Data Flow
type: architecture
status: active
date: 2026-05-16
tags: [architecture, backend, frontend, data-flow, two-tier, health, websocket-snapshots, setup-wizard, no-auth, configstore, electron, phase-0b, task-b5, event-subscription]
description: Data flow documentation for setup wizard, service monitoring (two-tier health model), real-time updates with full snapshot payloads, encrypted ConfigStore lifecycle, and Tor ControlPort event subscription lifecycle (Task B5)
aliases: [data flow, request flow, communication patterns]
---

# Data Flow

> [!abstract] Overview
> This document describes the primary data flows in Watchman: setup, service monitoring with the two-tier health model, real-time WebSocket updates, and the encrypted ConfigStore service lifecycle.
>
> **No built-in authentication** — Watchman is a single-user home-lab app; network isolation (firewall / VPN / LAN) is the operator's responsibility. See [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]].
>
> **Two-Tier Health Model** (Phase 0a): Each service check runs ICMP ping and protocol probe in parallel, returning separate `host` and `service` tiers. See [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019]] Phase 0a.

## Setup Wizard / First-Run Flow

```
1. App starts → backend reads dataDir, loads-or-creates the master key
2. ConfigStore migrations run (DuckDB)
3. Optional env→DB migration: legacy env services are imported once
4. ServiceLifecycle.start() loads all stored services, brings up enabled ones,
   registers them in ServiceRegistry, hands them to BackgroundPoller
5. Frontend boots → GET /setup/status
   → { needsSetup: services.length === 0, serviceCount }
6. If needsSetup, the SetupWizard renders
7. User picks a kind from GET /config/kinds and submits config
   → POST /config/services
   → ConfigStore encrypts secret fields (AES-GCM, per-install master key)
   → INSERT into DuckDB, bus.emit('config:service.created')
   → ServiceLifecycle.applyCreate(id) brings up the service and tracks it
8. Broadcaster sees `config:service.created` and sends `service_config_changed`
9. Frontend invalidates `/services` query, the tile appears
```

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

### Stats Flow

```
1. Frontend requests stats → GET /api/services/{kind}/stats?instance={id}
2. Fastify request timeout attaches AbortSignal
3. GetServiceStatus.stats(kind, instance, signal) is invoked
4. ServiceRegistry resolves `${kind}:${instanceId}` → BaseService
5. svc.getStats(signal) returns a StatsSnapshot (cached in-process when applicable)
6. Envelope { data | error } returned to frontend; React Query stores it
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

## Configuration Flow (UI-Driven ConfigStore)

```
1. Backend starts → loadEnv() validates env with Zod
2. createDuckDbPool() + runConfigMigrations() prepare the on-disk store
3. loadOrCreateMasterKey(dataDir, WATCHMAN_MASTER_KEY) ensures key material
4. createConfigStore(dbPool, encryptor, bus) wires encrypted reads/writes
5. migrateEnvServicesIfNeeded() one-shot imports legacy ENABLED_SERVICES env
6. ServiceLifecycle.start() iterates StoredService rows:
   - bringUp(stored) for each enabled service
   - svc.onStart() if present (e.g. Tor onStart spins up ControlPort event
     subscription for BW events — Task B5)
   - registry.register(svc) keyed by `${kind}:${instanceId}`
   - poller.track(svc) schedules jittered health + stats polls
7. Frontend lifecycle:
   - GET /setup/status renders SetupWizard if needsSetup
   - GET /config/kinds → field schema + secret-field list for each service type
   - GET /config/services / POST / PUT / DELETE go through ConfigStore;
     each write emits a typed bus event and triggers
     ServiceLifecycle.applyCreate/Update/Delete which re-registers
     and re-tracks the affected service
   - GET /services aggregates the live registry into BentoDashboard tiles
8. Graceful shutdown (SIGTERM/SIGINT): poller.stop → lifecycle.stop
   → dbPool.close → app.close (each service's onStop runs in turn)
```

## PlantUML Diagrams

### Setup Wizard Flow

```plantuml
@startuml
!theme plain

actor "User (operator)" as User
participant "Frontend (SetupWizard)" as FE
participant "Fastify /setup, /config" as API
participant "ConfigStore (DuckDB)" as Store
participant "Encryptor (master key)" as Enc
participant "ServiceLifecycle" as Life
participant "BackgroundPoller" as Poll
participant "EventBus" as Bus
participant "WS Broadcaster" as WS

User -> FE : Open Watchman (first run)
FE -> API : GET /setup/status
API --> FE : { needsSetup: true, serviceCount: 0 }
FE -> API : GET /config/kinds
API --> FE : [{ kind, label, fields, secretFields }]
User -> FE : Pick kind, fill fields
FE -> API : POST /config/services { kind, instance, config }
API -> Enc : encrypt secret fields
Enc --> API : ciphertext
API -> Store : INSERT stored_services
Store --> Bus : config:service.created
Bus --> Life : applyCreate(id)
Life -> Poll : pause()
Life -> Life : bringUp(stored)
Life -> Poll : resume() + track(svc)
Bus --> WS : config:service.created
WS --> FE : { type: 'service_config_changed', action: 'created' }
FE -> FE : invalidate /services query → tile appears
@enduml
```

### Service Monitoring Flow (two-tier health)

```plantuml
@startuml
!theme plain

actor "Frontend (ApiClient)" as FE
participant "Fastify route" as API
participant "GetServiceStatus" as App
participant "ServiceRegistry" as Reg
participant "BaseService" as Svc
participant "PingProber" as Ping
database "External Service" as ExtSvc

FE -> API : GET /api/services/{kind}/health?instance={id}
API -> API : log sampling + request timeout (AbortSignal)
API -> App : health(kind, instance, signal)
App -> Reg : lookup `${kind}:${instanceId}`
Reg --> App : BaseService
App -> Svc : checkHealth(signal)

note over Svc
  Service runs host + service probes
  in parallel via Promise.allSettled.
end note

Svc -> Ping : probe(host)
Svc -> ExtSvc : HTTP / RPC / SSH / SNMP / ZMQ
Ping --> Svc : { reachable, pingMs }
ExtSvc --> Svc : protocol response
Svc --> App : Result<HealthSnapshot>
App --> API : envelope { data }
API --> FE : JSON { data: { host, service, reachable } }
@enduml
```

### Real-Time Updates Flow

```plantuml
@startuml
!theme plain

participant "BackgroundPoller" as Poll
participant "BaseService" as Svc
participant "EventBus" as Bus
participant "Broadcaster" as WSB
participant "WS Connection N" as Conn
participant "useWebSocket / useWebSocketEvent" as Hook
participant "React Query Cache" as Query

note over Poll : Ticks on jittered healthMs / statsMs

Poll -> Svc : checkHealth(signal) / getStats(signal)
Svc --> Poll : HealthSnapshot / StatsSnapshot
Poll --> Bus : service.health.updated / service.stats.updated\n(snapshot included)
Bus --> WSB : subscriber callback
WSB -> Conn : ws.send({ type: 'service_update', scope, id, kind, instanceId, snapshot, at })
Conn --> Hook : onmessage
Hook -> Query : setQueryData / invalidateQueries
Query --> Hook : re-render bento tile / detail sheet
@enduml
```

### Boot / Lifecycle Initialization Flow

```plantuml
@startuml
!theme plain

participant "index.ts (main)" as Main
participant "Env (Zod)" as Env
participant "DuckDB ConfigStore" as Store
participant "Master key" as Key
participant "ServiceRegistry" as Reg
participant "ServiceLifecycle" as Life
participant "BackgroundPoller" as Poll
participant "Fastify server" as API
participant "wsPlugin" as WS

Main -> Env : loadEnv() (validates with Zod)
Main -> Store : createDuckDbPool() + runConfigMigrations()
Main -> Key : loadOrCreateMasterKey(dataDir)
Main -> Store : createConfigStore(pool, encryptor, bus)
Main -> Store : migrateEnvServicesIfNeeded() (one-shot)
Main -> Life : createServiceLifecycle({ store, registry, poller, bus, infra })
Life -> Reg : register every enabled service
Life -> Poll : track(svc)
Main -> API : buildServer({ services, listInstances, metrics, config, setup })
Main -> WS : app.register(wsPlugin)
Main -> API : app.listen({ BACKEND_V2_HOST, BACKEND_V2_PORT })

note over Main
  Graceful shutdown (SIGTERM/SIGINT):
  poller.stop → lifecycle.stop → dbPool.close → app.close
end note
@enduml
```

## Related

- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/features/real-time-updates|Real-Time Updates]]
- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017 — Single-user, no auth]]
- [[docs/adr/015-ui-driven-service-configuration|ADR-015 — UI-driven ConfigStore]]
- [[docs/flow-visualizer.html|Interactive flow visualizer]]
