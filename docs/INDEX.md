---
title: Watchman Project Knowledge Base
type: index
status: active
date: 2026-04-19
tags: [knowledge-base, index, project, overview, ai-agent-friendly, design-system, primitives, electron, desktop, setup-wizard, single-user, v2]
description: Main entry point to the Watchman project documentation - single-user self-hosted service monitoring dashboard with dark-luxury bento design system, no authentication
aliases: [KB, docs, documentation, knowledge base, home, README]
---

# Watchman Knowledge Base

> [!abstract] About This KB
> Welcome to the Watchman project documentation. This knowledge base is designed for **developers**, **AI agents**, and **computer scientists**. It contains architectural decisions, API documentation, guides, code references, and all project knowledge needed to understand, contribute to, and extend Watchman.
>
> **For AI Agents**: Use `Ctrl/Cmd+O` to quick-open any document. Start with the [[docs/guides/ai-agent-workflow|AI Agent Workflow]] document for comprehensive instructions.

## Quick Start

| If you're...                         | Start here                      |
| ------------------------------------ | ------------------------------- | ------------------------------------------- | ---------------------- |
| **New developer**                    | [[docs/getting-started          | Getting Started MOC]] → [[docs/guides/setup | Setup Guide]]          |
| **Running the desktop app**          | [[docs/guides/running-the-desktop-app | Desktop App Guide]]       |
| **Deploying backend to Pi**          | [[docs/guides/deploying-to-raspberry-pi | Pi Deploy Guide]]         |
| **Looking for an API**               | [[docs/api/index                | API Overview]] or [[docs/integrations/index | Service Integrations]] |
| **Making an architectural decision** | [[docs/adr/index                | ADR Index]] → [[docs/adr/template           | ADR Template]]         |
| **Understanding the architecture**   | [[docs/architecture/index       | Architecture Overview]]                     |
| **Adding a service**                 | [[docs/guides/adding-services   | Adding Services Guide]]                     |
| **An AI agent**                      | [[docs/guides/ai-agent-workflow | AI Agent Workflow]] (start here!)           |

> [!tip] AI Agent Quick Reference
>
> 1. **Read before writing** - Check existing docs before adding new content
> 2. **Use ADRs for decisions** - Document significant design choices in `docs/adr/`
> 3. **Update relevant docs** - Keep API, features, and integration docs in sync with code
> 4. **Use templates** - Start new documents from templates in each section
> 5. **Use wiki-links** - Link to code with `[[apps/backend/services/ServiceName.js]]` format
> 6. **Search first** - Use Obsidian MCP tools to search the KB before reading code

## Knowledge Areas

| Area                         | Description              | Documents                            |
| ---------------------------- | ------------------------ | ------------------------------------ | ------------------- |
| 🏗️ [[docs/adr/index          | Architecture Decisions]] | Major design decisions and rationale | 18 ADRs             |
| 📡 [[docs/api/index          | API Documentation]]      | REST API endpoints and schemas       | 9 endpoints         |
| 📖 [[docs/guides/index       | Guides]]                 | Setup, deployment, Pi deploy, contributing, and wizard  | 7 guides            |
| ⚡ [[docs/features/index     | Features]]               | Feature documentation                | 5 features          |
| 🔌 [[docs/integrations/index | Integrations]]           | External service integrations        | 14 integrations     |
| 🔒 [[docs/security/index     | Security]]               | Security policies and practices      | 4 security docs     |
| 🚀 [[docs/performance/index  | Performance]]            | Performance optimizations            | 2 docs              |
| 🎨 [[docs/architecture/frontend-design-system | Design System]] | Dark-luxury tokens, primitives, motion | Complete reference |
| 🧩 [[docs/components/index   | Components]]             | Frontend React components and hooks  | 30+ components + 14 primitives |
| 🧪 [[docs/testing/index      | Testing]]                | Testing strategies and patterns      | 2 testing docs      |
| 📐 [[docs/architecture/index | Architecture]]           | System diagrams and architecture     | 3 architecture docs |

## AI Agent Workflow

```mermaid
graph TD
    A[Start Task] --> B{Search KB First}
    B -->|Found| C[Read Relevant Docs]
    B -->|Not Found| D[Check Code]
    C --> E{Make Changes}
    E --> F[Update Relevant Docs]
    F --> G[Add Code Links]
    G --> H[Update Frontmatter Dates]
    D --> E
```

### Common AI Agent Tasks

| Task                   | Documentation                 |
| ---------------------- | ----------------------------- | ------------------------------------------------- | ----------------- |
| Add a new service      | [[docs/guides/adding-services | Adding Services Guide]]                           |
| Add a new API endpoint | [[docs/api/index              | API Documentation]] + [[apps/backend/openapi.yaml | OpenAPI Spec]]    |
| Fix a bug              | [[docs/guides/contributing    | Contributing Guide]] + [[docs/troubleshooting     | Troubleshooting]] |
| Add tests              | [[docs/testing/index          | Testing Index]]                                   |
| Security review        | [[docs/security/index         | Security Index]]                                  |

## Reference

| Resource                                  | Description             |
| ----------------------------------------- | ----------------------- | ---------------------------------------- |
| 📚 [[docs/glossary                        | Glossary]]              | Key terms, aliases, and disambiguation   |
| 🏷️ [[docs/tag-taxonomy                    | Tag Taxonomy]]          | Controlled vocabulary for KB tags        |
| 🔧 [[docs/troubleshooting                 | Troubleshooting]]       | Common issues and solutions              |
| 🗺️ [[docs/getting-started                 | Getting Started]]       | Map of Content for navigation            |
| 📋 [[docs/common-tasks                    | Common Tasks]]          | Task-oriented quick reference            |
| 🔑 [[docs/reference/environment-variables | Environment Variables]] | All env vars in one place                |
| ⚙️ [[docs/reference/scripts               | Scripts Reference]]     | All npm commands                         |
| 💻 [[docs/reference/code-patterns         | Code Patterns]]         | Standard code patterns for all layers    |
| ❌ [[docs/reference/error-codes           | Error Codes]]           | All API error responses and status codes |
| 📝 [[docs/LOGGING.md                      | Logging]]               | Structured logging configuration         |

## Recent Updates

```dataview
TABLE WITHOUT ID file.link AS "Document", date AS "Date", type AS "Type", tags AS "Tags"
FROM "docs"
WHERE date AND date >= date(today) - dur(14 days)
SORT date DESC
LIMIT 15
```

## Project Overview

Watchman is a comprehensive **self-hosted service monitoring dashboard** supporting:

- **Service Monitoring**: Health checks and statistics for 14+ service types
- **Multi-Instance Support**: Run multiple nodes of the same service type
- **Real-Time Updates**: WebSocket-based status broadcasting
- **Single-User Design**: Simplified for home-lab deployments (no authentication)
- **Time-Series Metrics**: DuckDB-backed historical data with auto-rollups
- **UI-Driven Configuration**: Service management via web UI with encrypted secrets
- **OpenAPI**: Full API documentation with Swagger UI

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + OKLCH tokens + Geist typography + 14 custom primitives
- **Backend**: Node.js 18+ + TypeScript + Fastify 4 + Zod validation + Pino logging + DuckDB time-series
- **Communication**: WebSocket for real-time updates (WebSocketProvider singleton + useWebSocket hook)
- **State**: In-process LRU cache, croner-based polling, circuit breaker, DuckDB time-series (raw/1m/5m/1h rollups)
- **Tooling**: ESLint, Prettier, Vitest (396 tests across backend+frontend)
- **Architecture**: npm workspaces monorepo, layered backend (config → core → infra → domain → application → transport)

### Project Structure

```
Watchman/
├── apps/
│   ├── frontend/          # React 18 + TypeScript + Vite + Tailwind
│   │   ├── src/
│   │   │   ├── components/ # Bento tiles, detail sheets, primitives
│   │   │   ├── hooks/     # useServiceHealth, useWebSocket, useServiceHistory
│   │   │   ├── pages/     # Page components
│   │   │   ├── services/  # API client, WebSocket, renderer registry
│   │   │   ├── styles/    # OKLCH tokens, Geist fonts
│   │   │   ├── providers/ # WebSocketProvider
│   │   │   └── lib/       # Utilities
│   │   └── tests/         # Frontend tests (150+)
│   ├── backend/           # TypeScript + Fastify 4 + DuckDB
│   │   ├── src/
│   │   │   ├── config/    # Env validation, service registry
│   │   │   ├── core/      # Logger, errors, Result, eventBus
│   │   │   ├── infra/     # HTTP, SSH, GPIO, SNMP, cache, poller, timeseries (DuckDB)
│   │   │   ├── domain/    # BaseService, ServiceRegistry
│   │   │   ├── application/ # UseCases (GetServiceHistory, etc.)
│   │   │   └── transport/ # Fastify routes, WebSocket
│   │   ├── openapi.yaml   # OpenAPI 3.1 spec (includes /history)
│   │   ├── dist/          # Compiled JavaScript
│   │   └── package.json
│   └── desktop/           # Electron 33 wrapper
│       ├── src/
│       │   ├── main.ts    # Electron main process
│       │   ├── preload.ts # Sandboxed preload script
│       │   ├── backend.ts # Backend process spawner
│       │   ├── frontendProtocol.ts # Custom watchman:// protocol
│       │   └── freePort.ts # Port acquisition
│       ├── electron-builder.yml # Distribution targets
│       └── package.json
├── docs/                   # Obsidian knowledge base (157 docs)
├── packages/               # Shared packages
└── tools/                 # Dev scripts
```

## Key Concepts

> [!info] Desktop Distribution
> Watchman ships as a standalone Electron desktop application (macOS dmg, Windows NSIS, Linux AppImage+deb) that auto-spawns the Node.js backend on a loopback port and serves the React frontend via a custom `watchman://` protocol. Each installation gets a unique master key for encrypting service credentials. See [[docs/adr/016-electron-desktop-wrapper|ADR-016]] and [[docs/guides/running-the-desktop-app|Desktop App Guide]].

> [!info] Split Deploy — Pi Backend + Mac Electron Client
> For always-on polling without Mac-sleep gaps, the backend can run natively on a Raspberry Pi under systemd while the Mac Electron app becomes a pure client paired via setup-wizard URL entry. LAN-only, no auth, no TLS. Offline banner surfaces when the Pi is unreachable. See [[docs/adr/018-split-deploy-pi-backend|ADR-018]] and [[docs/guides/deploying-to-raspberry-pi|Pi Deploy Guide]].

> [!info] Time-Series (Phase 1), Design System (Phase 2) & Bento Dashboard (Phase 3)
> **Phase 1** (LIVE) adds embedded DuckDB time-series storage with tiered rollups (raw/1m/5m/1h) and a `/services/:kind/history` endpoint for querying historical metrics. **Phase 2** (LIVE) ships dark-luxury OKLCH tokens, Geist Variable typography, and 14 custom primitives. **Phase 3** (LIVE — pilot) adds the bento dashboard with a generic `ServiceTile` driven by a `ServiceRenderer` registry. Live behind `?bento=1` flag with Bitcoin and Synology pilot services. See [[docs/features/time-series-history|Time-Series Feature]], [[docs/architecture/frontend-design-system|Frontend Design System]], [[docs/components/primitives/index|Primitives Index]], and [[docs/components/bento-dashboard|Bento Dashboard]].

> [!info] Service Pattern
> Each service extends [[apps/backend/src/domain/BaseService.ts|BaseService]] and implements `checkHealth()` for status checks and `getStats()` for detailed metrics. Services are registered in [[apps/backend/src/domain/ServiceRegistry.ts|ServiceRegistry]] using `${kind}:${instanceId}` keys (e.g., `qbittorrent:1`, `qbittorrent:2`).

> [!info] Multi-Instance Services
> Services like qBittorrent support multiple instances via numbered env vars: `QBITTORRENT_1_URL`, `QBITTORRENT_2_URL`, etc. Legacy single-instance config is still supported. See [[docs/features/multi-instance|Multi-Instance Feature]].

> [!info] Single-User Design
> Watchman is a single-user home-lab monitoring application with no built-in authentication. Network isolation (firewall, VPN, or closed LAN) is the operator's responsibility. See [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] for design rationale.

> [!info] Rate Limiting Tiers
>
> - **Health**: 100 req/15min per IP
> - **Auth**: 5 req/15min per IP
> - **Sensitive write endpoints**: 20 req/15min per IP
> - **General API**: 100 req/15min per IP

## Code Search Quick Reference

| Search For          | Location                                             |
| ------------------- | ---------------------------------------------------- |
| Service classes     | `apps/backend/src/domain/services/*/`                |
| Frontend components | `apps/frontend/src/components/*.tsx`                 |
| Desktop app (Electron) | `apps/desktop/src/`                               |
| API routes          | `apps/backend/src/transport/http/routes/`            |
| Core layer          | `apps/backend/src/core/`                             |
| Infrastructure      | `apps/backend/src/infra/`                            |
| Configuration       | `apps/backend/src/config/`                           |
| Frontend hooks      | `apps/frontend/src/hooks/*.ts`                       |
| API client          | `apps/frontend/src/services/ApiClient.ts`            |
| Environment config  | `apps/backend/.env.example`                          |
| Circuit breaker     | `apps/backend/src/infra/circuitBreaker.ts`           |

## Contributing

1. Read the [[docs/guides/contributing|Contributing Guide]]
2. Check [[docs/adr/index|ADRs]] for context on decisions
3. Follow [[docs/reference/code-patterns|Code Patterns]]
4. Add tests for new features
5. Update relevant docs
6. Run `npm run lint` before committing

## PlantUML Diagrams

### System Architecture Overview

```plantuml
@startuml
!theme plain

package "Frontend (React 18)" as FE {
    [Service Cards]
    [Hooks]
    [React Query]
    [WebSocket]
}

package "Backend (TypeScript/Fastify 4)" as BE {
    [Config Layer]
    [Core Layer]
    [Infrastructure]
    [Domain Services]
    [Application]
    [Transport]
}

package "Security Layer" as SEC {
    [JWT Auth]
    [CSRF]
    [Rate Limiting]
    [IP Control]
}

database "External Services" as Ext {
    [AdGuard]
    [Bitcoin]
    [Tor]
    [qBittorrent]
    [Homebridge]
    [Synology]
    [14+ Services]
}

FE <--> BE : REST API + WebSocket
BE --> SEC : Applies security
BE --> Ext : Health/Stats

note right of FE
  React 18 + TypeScript
  Vite + Tailwind + shadcn/ui
end note

note right of BE
  TypeScript + Fastify 4
  Layered architecture
  In-process LRU cache
end note
@enduml
```

### Request Processing Flow

```plantuml
@startuml
!theme plain

actor "User" as User
participant "Frontend" as FE
participant "Express" as Express
participant "Middleware" as MW
participant "ServiceManager" as SM
participant "CircuitBreaker" as CB
participant "Service" as Svc
database "External" as Ext

User -> FE : View Dashboard
FE -> Express : GET /api/services/health

Express -> MW : Apply middleware chain

MW -> MW : Rate limit check
MW -> MW : IP control check
MW -> MW : Auth check (if required)

MW -> SM : Route to service
SM -> CB : Execute with circuit breaker

alt Circuit Closed
    CB -> Svc : call checkHealth()
    Svc -> Ext : HTTP/SSH request
    Ext --> Svc : Response
    Svc --> CB : Result
    CB --> SM : Result
    SM --> MW : JSON response
    MW --> Express : Response
    Express --> FE : JSON
    FE --> User : Updated UI

else Circuit Open
    CB --> SM : Error
    SM --> Express : 503
    Express --> FE : Service Unavailable
    FE --> User : Show offline
end
@enduml
```

### Data Flow Summary

```plantuml
@startuml
!theme plain

skinparam backgroundColor #F0F8FF

partition "Frontend" {
    [Service Card] as Card
    [useServiceHealth] as Hook
    [React Query] as Query
    [useWebSocket] as WS
}

partition "Backend" {
    [API Endpoint] as API
    [ServiceManager] as Mgr
    [Service Class] as Svc
    [WebSocketManager] as WSM
}

partition "External" {
    [Monitored Service] as Ext
}

Card -> Hook : Render
Hook -> Query : useQuery()

Query -> API : Fetch health
API -> Mgr : getServiceHealth()
Mgr -> Svc : checkHealth()
Svc -> Ext : Ping service
Ext --> Svc : Status
Svc --> Mgr : Result
Mgr --> API : JSON
API --> Query : Response
Query --> Card : Data

note over Ext, Card
  WebSocket Real-Time Updates
end note

Ext --> WSM : Status change
WSM --> Query : Invalidate
Query --> Card : Auto-refresh
@enduml
```

### Knowledge Base Structure

```plantuml
@startuml
!theme plain

folder "docs/" as KB {
    folder "adr/" as ADRs {
        [001-012 ADRs] as ADR
    }

    folder "api/" as API {
        [Endpoints] as API_DOC
    }

    folder "architecture/" as ARCH {
        [Backend, Frontend, Data Flow] as ARCH_DOC
    }

    folder "components/" as COMP {
        [Cards, Hooks, UI] as COMP_DOC
    }

    folder "features/" as FEAT {
        [Service Monitoring, Multi-Instance, Real-Time] as FEAT_DOC
    }

    folder "guides/" as GUIDES {
        [Setup, Deployment, Adding Services] as GUIDE_DOC
    }

    folder "integrations/" as INT {
        [14+ Service Docs] as INT_DOC
    }

    folder "security/" as SEC {
        [Auth, Rate Limiting, IP Control] as SEC_DOC
    }

    folder "performance/" as PERF {
        [Caching, Request Optimization] as PERF_DOC
    }

    folder "reference/" as REF {
        [Environment Variables, Code Patterns] as REF_DOC
    }

    [INDEX.md] as INDEX
    [glossary.md] as GLOSSARY
    [getting-started.md] as GS
}

INDEX --> ADRs
INDEX --> API
INDEX --> ARCH
INDEX --> COMP
INDEX --> FEAT
INDEX --> GUIDES
INDEX --> INT
INDEX --> SEC
INDEX --> PERF
INDEX --> REF
INDEX --> GLOSSARY
INDEX --> GS

note right of KB
  117+ documents
  14 directories
  Dataview queries
  PlantUML diagrams
end note
@enduml
```
