---
title: "API: Frontend Configuration"
type: api
status: active
date: 2026-04-02
tags: [api, config, frontend, backend]
description: GET /api/config/frontend - Frontend configuration endpoint
aliases: [frontend config, config endpoint, frontend configuration]
---

# Frontend Configuration Endpoint

> [!abstract] Overview
> Provides runtime configuration to the frontend application. No authentication required.

## Endpoint

| Property   | Value                      |
| ---------- | -------------------------- |
| **Method** | `GET`                      |
| **Path**   | `/api/config/frontend`     |
| **Auth**   | None                       |
| **Rate**   | `generalLimiter`           |
| **Source** | [[apps/backend/server.js]] |

## Response

### 200 OK

```json
{
  "enabledServices": ["adguard", "bitcoin", "tor", "qbittorrent"],
  "version": "1.0.0",
  "features": {
    "multiInstance": true,
    "webSocket": true
  }
}
```

| Field             | Type       | Description                         |
| ----------------- | ---------- | ----------------------------------- |
| `enabledServices` | `string[]` | List of enabled service identifiers |
| `version`         | `string`   | Backend version                     |
| `features`        | `object`   | Feature flags for frontend          |

## Usage

Called by the frontend on initial load to determine which service cards to render.

### Frontend Hook

```typescript
// apps/frontend/src/hooks/use-config.tsx
const { data: config } = useConfig();
// config.enabledServices determines which cards are shown
```

## Source

- Route: [[apps/backend/server.js]]
- Service: [[apps/backend/services/FrontendConfigService.js]]
- Frontend hook: [[apps/frontend/src/hooks/use-config.tsx]]

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
participant "useConfig hook" as Hook
participant "FrontendConfigService" as Svc
participant "Config" as Cfg

FE -> Hook : Mount\nuseConfig()

Hook -> Svc : GET /api/config/frontend

Svc -> Cfg : Get enabled services

alt ENABLED_SERVICES set
    Cfg -> Cfg : Parse from string
else Not set
    Cfg -> Cfg : Use default all
end

Svc --> Hook : { enabledServices, version, features }
Hook --> FE : Render service cards

note right of FE
  Only cards for enabled
  services are rendered
end note
@enduml
```
