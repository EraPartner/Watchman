---
title: "API: Frontend Configuration"
type: api
status: superseded
date: 2026-04-10
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [api, config, frontend, backend]
description: GET /api/config/frontend - Frontend configuration endpoint
aliases: [frontend config, config endpoint, frontend configuration]
---

# Frontend Configuration Endpoint

> [!danger] Superseded — No Longer Implemented
> This document describes the **v1 frontend config endpoint** (`GET /api/config/frontend`). The backend was rewritten to TypeScript + Fastify 4 in v2.0; current config API is at `GET /config/services` and documented in the OpenAPI spec (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]]). Content retained for archival reference only.


> [!abstract] Overview
> Provides runtime configuration to the frontend application. No authentication required.

## Endpoint

| Property   | Value                                 |
| ---------- | ------------------------------------- |
| **Method** | `GET`                                 |
| **Path**   | `/api/config/frontend`                |
| **Auth**   | None                                  |
| **Rate**   | `generalLimiter`                      |
| **Source** | `apps/backend/routes/metaRoutes.js` |

## Response

### 200 OK

```json
{
  "enabledServices": ["adguard", "bitcoin", "tor", "qbittorrent"],
  "services": {
    "adguard": { "webUrl": "http://127.0.0.1:5213", "useAuth": true },
    "tor": { "proxyPort": 9050, "controlPort": 9051, "useProxy": true }
  },
  "app": {
    "name": "Watchman Dashboard",
    "version": "1.0.0",
    "description": "Self-hosted home lab dashboard"
  },
  "network": {
    "frontendUrl": "http://localhost:5173",
    "backendUrl": "http://localhost:3001"
  },
  "security": {
    "csrf": {
      "cookieName": "csrfToken",
      "headerName": "x-csrf-token"
    }
  }
}
```

| Field             | Type       | Description                                                              |
| ----------------- | ---------- | ------------------------------------------------------------------------ |
| `enabledServices` | `string[]` | List of enabled service identifiers                                      |
| `services`        | `object`   | Service-specific frontend config (URLs/flags)                            |
| `app`             | `object`   | App metadata (`name`, `version`, `description`)                          |
| `network`         | `object`   | Optional frontend/backend URL values exposed for runtime diagnostics     |
| `security`        | `object`   | Frontend-consumable security config (currently CSRF cookie/header names) |

## Usage

Called by the frontend on initial load to determine which service cards to render.

`security.csrf` is consumed by `apps/frontend/src/lib/csrf.ts` via `apps/frontend/src/services/apiClient/endpoints.ts` (`getFrontendConfig()`) to configure CSRF header/cookie names dynamically.

### Frontend Hook

```typescript
// apps/frontend/src/hooks/useFrontendConfig.ts
const { data: config } = useFrontendConfig();
// config.enabledServices determines which cards are shown
```

## Source

- Route module: `apps/backend/routes/metaRoutes.js`
- Registration: `apps/backend/routes/registerApiRoutes.js`, `apps/backend/bootstrap/registerRoutes.js`, `apps/backend/server.js`
- Service: `apps/backend/services/FrontendConfigService.js`
- Frontend hook: `apps/frontend/src/hooks/useFrontendConfig.ts`
- Query keys: [[apps/frontend/src/lib/queryKeys.ts]]
- OpenAPI schema: [[apps/backend/openapi.yaml]] (`FrontendConfigResponse`)

## Related

- [[docs/api/index|API Index]]
- [[docs/features/service-monitoring|Service Monitoring]]
- [[docs/features/multi-instance|Multi-Instance Support]]

## PlantUML Diagrams

### Frontend Config Flow

```plantuml
@startuml
!theme plain

participant "Frontend" as FE
participant "useFrontendConfig hook" as Hook
participant "FrontendConfigService" as Svc
participant "Config" as Cfg

FE -> Hook : Mount\nuseFrontendConfig()

Hook -> Svc : GET /api/config/frontend

Svc -> Cfg : Get enabled services

alt ENABLED_SERVICES set
    Cfg -> Cfg : Parse from string
else Not set
    Cfg -> Cfg : Use default all
end

Svc --> Hook : { enabledServices, services,
app, network, security.csrf }
Hook --> FE : Render service cards

note right of FE
  Only cards for enabled
  services are rendered
end note
@enduml
```
