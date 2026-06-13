---
title: Service Integrations
type: index
status: active
date: 2026-06-13
tags:
  [
    integration,
    index,
    services,
    backend,
    fastify,
    typescript,
    snmp,
    snmp-walk,
    snmp-v2c,
    router-snmp,
    hue-api-v2,
    cert-pinning,
    ipfs-extended-stats,
    roon-api,
    websocket,
    zones,
    now-playing,
    rn1,
    rn2,
  ]
description: Index of all external service integration documentation for the Watchman project - each implements BaseService; includes SNMP walk support (v2c/v3) for network device monitoring; Philips Hue with API v2 and cert pinning; IPFS with extended metrics; Roon with optional WebSocket API for zone/now-playing tracking
aliases: [integrations index, services, service docs]
---

# Service Integrations

> [!abstract] Overview
> Watchman integrates with 13 self-hosted service types. Each integration extends [[apps/backend/src/domain/BaseService.ts|BaseService]] and implements `checkHealth()` and `getStats()` methods. Services are registered via [[apps/backend/src/domain/ServiceRegistry.ts|ServiceRegistry]] using keys like `${kind}:${instanceId}` (e.g., `qbittorrent:main`, `qbittorrent:seedbox` for multi-instance support). Instances are configured in the DuckDB config store via the `/config` API or the Settings UI — not via environment variables (legacy `{SERVICE}_*` env vars are imported once on first boot, then ignored; see [[docs/adr/015-ui-driven-service-configuration|ADR-015]]).

## Integration Index

```dataview
TABLE WITHOUT ID file.link AS "Service", date AS "Date", status AS "Status"
FROM "docs/integrations"
WHERE type = "integration"
SORT file.name ASC
```

## Service Categories

### Network & Security

| Service                                     | Protocol         | Description                    |
| ------------------------------------------- | ---------------- | ------------------------------ |
| [[docs/integrations/adguard\|AdGuard Home]] | HTTP API         | DNS-level ad blocker           |
| [[docs/integrations/tor\|Tor]]              | HTTP/ControlPort | Tor relay monitoring           |
| [[docs/integrations/router\|Router]]        | ICMP/TCP/SNMP    | Network router (Beryl/Telenet) |

### Cryptocurrency

| Service                                 | Protocol | Description       |
| --------------------------------------- | -------- | ----------------- |
| [[docs/integrations/bitcoin\|Bitcoin]]  | RPC/ZMQ  | Bitcoin full node |
| [[docs/integrations/albyhub\|Alby Hub]] | HTTP API | Lightning wallet  |

### File Sharing & Storage

| Service                                        | Protocol | Description               |
| ---------------------------------------------- | -------- | ------------------------- |
| [[docs/integrations/qbittorrent\|qBittorrent]] | HTTP API | BitTorrent client         |
| [[docs/integrations/ipfs\|IPFS]]               | HTTP API | Decentralized file system |
| [[docs/integrations/synology\|Synology]]       | SNMP/DSM | NAS monitoring            |

### Smart Home & Media

| Service                                        | Protocol     | Description       |
| ---------------------------------------------- | ------------ | ----------------- |
| [[docs/integrations/homebridge\|Homebridge]]   | HTTP API     | Smart home bridge |
| [[docs/integrations/philips-hue\|Philips Hue]] | Hue API v2   | Smart lighting    |
| [[docs/integrations/roon\|Roon]]               | TCP/Roon API | Music server      |

### Infrastructure

| Service                                          | Protocol | Description         |
| ------------------------------------------------ | -------- | ------------------- |
| [[docs/integrations/macmini\|Mac Mini]]          | SSH/ICMP | macOS server        |
| [[docs/integrations/raspberry-pi\|Raspberry Pi]] | SSH/GPIO | Raspberry Pi device |

## PlantUML Diagrams

### Service Integration Overview

```plantuml
@startuml
!theme plain

package "Watchman Backend" {
    [ConfigStore (DuckDB)]
    [ServiceLifecycle]
    [buildService]
    [ServiceRegistry]
    [Poller]
    [Circuit Breaker]
}

package "Service Integrations" {
    package "Network & Security" {
        [AdGuard]
        [Tor]
        [Router]
    }

    package "Cryptocurrency" {
        [Bitcoin]
        [Alby Hub]
    }

    package "File Sharing & Storage" {
        [qBittorrent]
        [IPFS]
        [Synology]
    }

    package "Smart Home & Media" {
        [Homebridge]
        [Philips Hue]
        [Roon]
    }

    package "Infrastructure" {
        [Mac Mini]
        [Raspberry Pi]
    }
}

ConfigStore --> ServiceLifecycle : enabled instances (skips unloadable rows)
ServiceLifecycle --> buildService : per instance
buildService --> AdGuard : instantiates
buildService --> Bitcoin : instantiates
buildService --> Tor : instantiates
buildService --> qBittorrent : instantiates
buildService --> IPFS : instantiates
buildService --> Synology : instantiates
buildService --> Roon : instantiates
buildService --> PhilipsHue : instantiates
buildService --> Homebridge : instantiates
buildService --> MacMini : instantiates
buildService --> AlbyHub : instantiates
buildService --> RaspberryPi : instantiates
buildService --> Router : instantiates

ServiceLifecycle --> ServiceRegistry : registers (id = kind:instanceId)
ServiceLifecycle --> Poller : tracks for polling
Poller --> CircuitBreaker : per-service, isolates failures
@enduml
```

### Service Communication Patterns

```plantuml
@startuml
!theme plain

actor "Frontend" as FE
participant "Backend API" as API
participant "ServiceRegistry" as SR
participant "Circuit Breaker" as CB
participant "Service Class" as Svc
database "External Service" as Ext

FE -> API : GET /services/{kind}/health?instance={id}
API -> SR : Resolve kind:instanceId

SR -> CB : Check circuit state

alt Circuit Closed
    CB -> Svc : Execute checkHealth()
    Svc -> Ext : HTTP / RPC / SNMP / SSH probe
    Ext --> Svc : Response
    Svc --> CB : Result
    CB --> SR : Result
    SR --> API : Result
    API --> FE : { data: HealthSnapshot }

else Circuit Open
    CB --> SR : UnavailableError
    SR --> API : Error
    API --> FE : 503 Service Unavailable
end
@enduml
```

> [!note] Polling vs. on-demand
> The aggregate `GET /services` endpoint serves the latest snapshot published by
> the background [[apps/backend/src/infra/scheduler/poller.ts|Poller]]; it only
> probes live before the first poll completes. One service's failed probe is
> isolated (`Promise.allSettled`) and never blocks the others' results.

### Multi-Instance Service Pattern

```plantuml
@startuml
!theme plain

database "DuckDB config store\n(app_service_instance)" as DB

package "kind: qBittorrent" {
    [qbittorrent:main] as QB1
    [qbittorrent:seedbox] as QB2
}

package "kind: Synology" {
    [synology:nas1] as SY1
    [synology:nas2] as SY2
}

DB --> QB1 : row -> StoredService
DB --> QB2 : row -> StoredService
DB --> SY1 : row -> StoredService
DB --> SY2 : row -> StoredService

note right of QB1
  Each row is one instance, keyed by
  (kind, instanceId). buildService turns
  it into a separate service class instance
  with its own config + circuit breaker.
  Secrets are encrypted at rest.
end note
@enduml
```

> [!info] Configuration source of truth
> Instances live as rows in the DuckDB `app_service_instance` table, managed
> through the `/config` API and the Settings UI. Legacy `{SERVICE}_{N}_*`
> environment variables are imported **once** on first boot, then ignored. A row
> that can't be loaded (e.g. secrets that no longer decrypt after a master-key
> rotation) is skipped and surfaced via `GET /config/load-errors` rather than
> blocking the other instances.

## Adding a New Service

See [[docs/guides/adding-services|Adding Services Guide]] for step-by-step instructions.

## Related

- [[docs/features/service-monitoring|Service Monitoring]]
- [[docs/api/index|API Documentation]]
- [[docs/architecture/backend-architecture|Backend Architecture]]
