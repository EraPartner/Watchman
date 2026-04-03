---
title: Architecture
type: index
status: active
date: 2026-04-02
tags: [architecture, index]
description: Index of all architecture documentation for the Watchman project
aliases: [architecture index, system design, system architecture]
---

# Architecture

> [!abstract] Overview
> Watchman uses a client-server architecture with a React frontend and Node.js/Express backend communicating via REST API and WebSocket.

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
| [[docs/architecture/backend-architecture  | Backend Architecture]]  | Services, middleware, routes, and orchestration |
| [[docs/architecture/frontend-architecture | Frontend Architecture]] | Pages, components, hooks, and state management  |
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

package "Backend (Node.js/Express)" as BE {
    package "Auth Layer" {
        [JWT Auth]
        [CSRF]
        [Rate Limit]
        [IP Control]
    }

    package "Middleware" {
        [Logging]
        [Cache]
        [Validation]
        [Performance]
    }

    package "API Routes" {
        [/health]
        [/api/auth/*]
        [/api/services/*]
        [/api/config/*]
    }

    package "ServiceManager" {
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
  Express 4.x + JWT
  ESM modules
  Circuit breaker pattern
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
