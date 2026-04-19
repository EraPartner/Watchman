---
title: Architecture
type: index
status: active
date: 2026-04-19
tags: [architecture, index, fastify, typescript, layered, duckdb, configuration]
description: Index of all architecture documentation for the Watchman project - client-server with TypeScript backend
aliases: [architecture index, system design, system architecture]
---

# Architecture

> [!abstract] Overview
> Watchman uses a client-server architecture with a React 18 frontend and TypeScript + Fastify 4 backend. The backend uses a layered architecture (config → core → infra → domain → application → transport) with in-process LRU caching and croner-based background polling.

> [!note]
> The backend is bootstrapped from [[apps/backend/src/index.ts|index.ts]], which initializes the config, core, infra, and domain layers, then registers HTTP routes and WebSocket handlers via Fastify.

## Architecture Index

```dataview
TABLE WITHOUT ID file.link AS "Document", date AS "Date", status AS "Status"
FROM "docs/architecture"
WHERE type = "architecture"
SORT file.name ASC
```

## Documents

| Document                                  | Description             |
| ----------------------------------------- | ----------------------- | ----------------------------------------------- |
| [[docs/architecture/frontend-design-system | Frontend Design System]] | OKLCH tokens, typography, motion, primitives |
| [[docs/architecture/backend-architecture  | Backend Architecture]]  | Services, middleware, routes, and orchestration |
| [[docs/architecture/frontend-architecture | Frontend Architecture]] | Pages, components, hooks, and state management  |
| [[docs/architecture/core-systems          | Core Systems]]          | Event Bus and Service Lifecycle orchestration  |
| [[docs/architecture/data-flow             | Data Flow]]             | Authentication, monitoring, and WebSocket flows |

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vite + React)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Dashboard  │  │  Service     │  │   Auth UI    │     │
│  │              │  │  Cards       │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │ HTTPS / HTTP
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend API (Node.js/Express)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Auth Layer   │  │  Middleware  │  │   API Routes │     │
│  │ - JWT        │  │  - CSRF      │  │  - /health   │     │
│  │ - Rate Limit │  │  - Logging   │  │  - /api/*    │     │
│  │ - IP Control │  │  - Cache     │  │  - /api/docs │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              ServiceManager                         │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │   │
│  │  │AdGuard │ │Bitcoin │ │  Tor   │ │ IPFS   │ ... │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   AdGuard    │ │   Bitcoin    │ │     Tor      │
    │     Home     │ │     Node     │ │    Relay     │
    └──────────────┘ └──────────────┘ └──────────────┘
```

## Related

- [[docs/adr/index|Architecture Decision Records]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] — Time-series + bento design system
- [[docs/adr/015-ui-driven-service-configuration|ADR-015]] — UI-driven service configuration with DuckDB + encryption
- [[docs/components/primitives/index|Primitive Components Index]]
- [[docs/features/index|Features]]

## PlantUML Diagrams

### System Architecture Overview

```plantuml
@startuml
!theme plain

package "Frontend (React 18)" as FE {
    [Dashboard]
    [Service Cards]
    [Auth UI]
    [React Query]
    [WebSocket Hook]
}

package "Backend (TypeScript/Fastify 4)" as BE {
    package "Transport Layer" {
        [HTTP Routes]
        [WebSocket (4 classes)]
    }

    package "Application Layer" {
        [GetServiceStatus]
        [GetAggregatedHealth]
        [ControlService]
        [ListInstances]
    }

    package "Domain Layer" {
        [BaseService]
        [ServiceRegistry]
    }

    package "Infrastructure Layer" {
        [HTTP Client]
        [SSH Client]
        [LRU Cache]
        [Circuit Breaker]
        [Poller]
    }

    package "Services" {
        [AdGuard]
        [Bitcoin]
        [Tor]
        [qBittorrent]
        [IPFS]
        [Synology]
        [Homebridge]
        [Roon]
        [Philips Hue]
        [Mac Mini]
        [Alby Hub]
        [Raspberry Pi]
        [Router]
    }
}

database "External Services" as Ext {
    [AdGuard Home]
    [Bitcoin Node]
    [Tor Relay]
    [qBittorrent]
    [IPFS Node]
    [Synology NAS]
    [Homebridge]
    [Roon Server]
    [Philips Hue]
    [Mac Mini]
    [Alby Hub]
    [Raspberry Pi]
    [Router]
}

FE --> BE : REST API (HTTPS)
FE --> BE : WebSocket (ws://)

BE --> Ext : Health checks\n& stats

note right of FE
  React 18 + TypeScript
  Vite + Tailwind + shadcn/ui
  React Query for state
end note

note right of BE
  TypeScript + Fastify 4
  Layered architecture
  In-process LRU cache
  Croner-based polling
end note
@enduml
```

### Communication Patterns

```plantuml
@startuml
!theme plain

participant "Frontend" as FE
participant "Backend" as BE
participant "External" as Ext

note over FE, BE
  REST API Communication
end note

FE -> BE : GET /api/services/health
BE --> FE : {services: {...}}

FE -> BE : GET /api/adguard/status
BE --> FE : {status: "online", ...}

note over FE, BE
  WebSocket Communication
end note

FE -> BE : Connect WebSocket
BE --> FE : Connection established

BE -> BE : Service status change
BE -> FE : Push update

note over BE, Ext
  Service Communication
end note

BE -> Ext : HTTP/SSH health check
Ext --> BE : Response
@enduml
```
