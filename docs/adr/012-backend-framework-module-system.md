---
title: ADR-012 - Backend Framework and Module System
type: adr
status: accepted
date: 2026-04-02
tags: [adr, backend, technology, nodejs]
description: Express.js 4.x with ES Modules (ESM) and esbuild bundler for the backend API server
aliases: [backend framework, express, esm, nodejs]
---

# ADR-012: Backend Framework and Module System

> [!abstract] Summary
> The backend uses Express.js 4.x as the HTTP framework with Node.js ES Modules (`"type": "module"`) and esbuild for production bundling.

## Status

- **Status**: Accepted
- **Date**: 2026-04-02

## Context

The backend needs a reliable HTTP framework to serve REST API endpoints, handle middleware, and manage WebSocket connections. The module system should align with modern Node.js best practices.

## Decision

### Framework: Express.js 4.x

- Mature, well-understood framework with vast middleware ecosystem
- Express 4.x (not 5.x) maximizes middleware compatibility
- Sufficient for REST API needs without unnecessary complexity

### Module System: ES Modules (ESM)

- `"type": "module"` in `package.json` enables ESM
- Uses `import`/`export` syntax throughout
- Aligns with modern Node.js best practices (Node 18+ target)

### Build Tool: esbuild

- Bundles backend code with `--packages=external` flag
- Keeps dependencies external in production bundle
- Fast build times

### Language: JavaScript (no TypeScript)

- Backend code is plain JavaScript
- Frontend uses TypeScript independently
- No shared TypeScript types between frontend and backend

### Key Code

- `[[apps/backend/server.js]]` - Main entry point
- `[[apps/backend/package.json]]` - Dependencies and build configuration

## Consequences

### Positive

- Express is mature with vast middleware ecosystem
- ESM modules align with modern Node.js best practices
- esbuild provides fast bundling
- External packages in bundle means `node_modules` must be deployed alongside (simpler dependency management)

### Negative

- Express 4.x limits some modern features available in 5.x
- No TypeScript on backend -- no compile-time type checking
- Frontend defines its own TypeScript interfaces for API responses (no shared types)
- esbuild with external packages means deployment must include `node_modules`

### Risks

- Lack of TypeScript on backend means type errors only surface at runtime
- Express 4.x will eventually reach end-of-life, requiring migration to 5.x

## PlantUML Diagrams

### Backend Stack Architecture

```plantuml
@startuml
!theme plain

package "Runtime" {
    [Node.js 18+]
}

package "Framework" {
    [Express 4.x]
    [Middleware Stack]
}

package "Module System" {
    [ES Modules]
    [import/export]
}

package "Build Tool" {
    [esbuild]
}

Node.js --> Express
Express --> Middleware
Node.js --> ESModules
ESModules --> Express

esbuild --> Express : Bundles for production

note right of esbuild
  --packages=external
  keeps node_modules external
end note
@enduml
```

### Request Processing Pipeline

```plantuml
@startuml
!theme plain

participant "Client" as Client
participant "Express" as Express
participant "Middleware Chain" as Chain
participant "Route Handler" as Handler
participant "Response" as Response

Client -> Express : HTTP Request

Express -> Chain : Apply middleware in order

note right of Chain
  Middleware examples:
  - helmet (security headers)
  - cors (cross-origin)
  - auth (JWT validation)
  - rate limiting
  - validation
end note

Chain -> Handler : Request reaches route

Handler -> Handler : Process request
Handler -> Response : Send JSON response

Response --> Client : HTTP Response

note right of Handler
  Route handlers call:
  - ServiceManager
  - Auth middleware
  - Response formatter
end note
@enduml
```

### ESM Module Structure

```plantuml
@startuml
!theme plain

package "server.js" as Main {
    [Entry point]
}

package "middleware" as MW {
    [auth.js]
    [csrf.js]
    [rateLimiting.js]
    [logger.js]
}

package "services" as SVC {
    [ServiceManager.js]
    [AdGuardService.js]
    [BitcoinService.js]
}

package "routes" as Routes {
    [serviceFactory.js]
}

package "utils" as Utils {
    [circuitBreaker.js]
}

Main --> MW : import
Main --> SVC : import
Main --> Routes : import
Main --> Utils : import

MW --> SVC : middleware uses
Routes --> SVC : routes call
SVC --> Utils : services use

note right of Main
  All use:
  import { x } from './module.js'
  export { y }
end note
@enduml
```

### Production Build Flow

```plantuml
@startuml
!theme plain

participant "Source Code" as Source
participant "esbuild" as Build
participant "Bundle" as Bundle
participant "node_modules" as NodeMods
participant "Deployment" as Deploy

Source --> Build : npx esbuild\nserver.js --bundle\n--packages=external\n--outfile=dist/bundle.js

Build -> Bundle : Create bundle
Build --> NodeMods : Keep external

note right of Bundle
  Bundle contains:
  - Your code
  - No dependencies

  Dependencies come from:
  - node_modules (deployed alongside)
end note

Bundle --> Deploy : Deploy bundle.js
NodeMods --> Deploy : Deploy node_modules/

note right of Deploy
  Deployment structure:
  /
  ├── bundle.js
  ├── openapi.yaml
  └── node_modules/
end note
@enduml
```

## References

- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/reference/code-patterns|Code Patterns]]
- Related code: `[[apps/backend/server.js]]`
- Related code: `[[apps/backend/package.json]]`
