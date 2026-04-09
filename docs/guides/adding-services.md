---
title: Adding Services Guide
type: guide
status: active
date: 2026-04-09
tags: [guide, backend, services, development]
description: Step-by-step guide to adding a new service integration to Watchman
aliases: [add service, new service, service integration, how to add service]
---

# Adding Services Guide

> [!abstract] Overview
> This guide walks you through adding a new service integration to Watchman.

## Overview

Each service follows a standard pattern:

1. Backend service class with health/stats methods
2. Factory configuration registration
3. Route generation (automatic via factory)
4. Frontend card component
5. OpenAPI spec update
6. Documentation

## Step 1: Create Backend Service Class

Create `apps/backend/services/NewServiceName.js`:

```javascript
export default class NewServiceName {
  constructor(config) {
    this.name = "newservice";
    this.config = config;
    this.enabled = this.checkConfig();
  }

  checkConfig() {
    return !!(this.config.host && this.config.port);
  }

  async checkHealth() {
    if (!this.enabled)
      return { status: "offline", timestamp: new Date().toISOString() };
    try {
      // Ping service endpoint
      const response = await fetch(
        `http://${this.config.host}:${this.config.port}/health`
      );
      return {
        status: response.ok ? "online" : "offline",
        timestamp: new Date().toISOString(),
        data: {
          /* service-specific data */
        },
      };
    } catch (error) {
      return {
        status: "offline",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getStats() {
    if (!this.enabled) return null;
    try {
      // Fetch detailed stats
      return {
        data: {
          /* stats */
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return { error: error.message, timestamp: new Date().toISOString() };
    }
  }
}
```

## Step 2: Register in Factory Config

Edit `apps/backend/services/serviceFactoryConfig.js`:

```javascript
import NewServiceName from "./NewServiceName.js";

export const serviceFactoryConfigs = {
  // ... existing services
  newservice: {
    ServiceClass: NewServiceName,
    getConfig: () => {
      if (!process.env.NEWSERVICE_HOST) return null;
      return {
        host: process.env.NEWSERVICE_HOST,
        port: parseInt(process.env.NEWSERVICE_PORT) || 8080,
      };
    },
  },
};
```

Add to default enabled services in `config.js`:

```javascript
return new Set([
  // ... existing services
  "newservice",
]);
```

## Step 3: Add Environment Variables

Edit `apps/backend/.env.example`:

```bash
# New Service Configuration
NEWSERVICE_HOST=192.0.2.1
NEWSERVICE_PORT=8080
```

Update `config.js` `getConfig()` to include the service config.

## Step 4: Register Route

For standard service `/status` + `/stats` endpoints, add the service ID to the factory route loop in `apps/backend/server.js`:

```javascript
for (const svc of [
  // ... existing services
  "newservice",
]) {
  app.use(
    `/api/${svc}`,
    createServiceRoutes(svc, serviceManager, factoryMiddleware)
  );
}
```

If the service supports update checks, add to the updates loop:

```javascript
for (const svc of [
  // ... existing services
  "newservice",
]) {
  app.use(
    `/api/${svc}`,
    createUpdatesRoute(svc, serviceManager, factoryMiddleware)
  );
}
```

If the service needs non-standard endpoints, implement them in a dedicated route module under `apps/backend/routes/` and register that module from `apps/backend/server.js` (current examples: `authRoutes.js`, `metaRoutes.js`, `controlRoutes.js`, `instanceRoutes.js`, `homebridgeRoutes.js`, `routerRoutes.js`).

## Step 5: Create Frontend Card Component

Create `apps/frontend/src/components/NewServiceCard.tsx`:

```tsx
import { OptimizedServiceCard } from "./OptimizedServiceCard";

export function NewServiceCard() {
  return (
    <OptimizedServiceCard
      serviceName="newservice"
      title="New Service"
      icon={<Icon />}
      renderStats={(stats) => <div>{/* Render service-specific stats */}</div>}
    />
  );
}
```

Add the card to the dashboard grid in the Index page.

## Step 6: Update OpenAPI Spec

Add endpoints to `apps/backend/openapi.yaml`:

```yaml
/api/newservice/status:
  get:
    summary: Get NewService health status
    tags: [newservice]
    responses:
      200:
        description: Health status
```

## Step 7: Create Documentation

Create `docs/integrations/newservice.md` following the [[docs/integrations/index|integration template]].

Update [[docs/components/index|Components Index]] with the new card.

## Checklist

- [ ] Service class created with `checkHealth()` and `getStats()`
- [ ] Registered in `serviceFactoryConfig.js`
- [ ] Added to default enabled services in `config.js`
- [ ] Environment variables added to `.env.example`
- [ ] Route added to factory loop and/or dedicated route module registered from `server.js`
- [ ] Frontend card component created
- [ ] Card added to dashboard
- [ ] OpenAPI spec updated
- [ ] Integration documentation created
- [ ] Components index updated

## PlantUML Diagrams

### Service Integration Flow

```plantuml
@startuml
!theme plain

participant "Developer" as Dev
participant "Backend" as BE
participant "Factory Config" as Factory
participant "Server" as Server
participant "Frontend" as FE
participant "Docs" as Docs

Dev -> BE : Create NewServiceName.js\n(service class)
Dev -> Factory : Register in\nserviceFactoryConfig.js
Dev -> BE : Add env vars to\n.env.example
Dev -> Server : Register route\n(factory loop or module)
Dev -> FE : Create NewServiceCard.tsx\n(frontend component)
Dev -> FE : Add card to dashboard
Dev -> Docs : Update openapi.yaml
Dev -> Docs : Create integration doc

note over Factory
  1. Import class
  2. Define getConfig()
  3. Add to configs object
end note

note over Server
  1. Add to service loop
  2. Add to updates loop (if applicable)
end note
@enduml
```

### Service Class Lifecycle

```plantuml
@startuml
!theme plain

participant "config.js" as Cfg
participant "ServiceFactory" as Factory
participant "ServiceManager" as SM
participant "Service Instance" as Svc

Cfg -> Cfg : parseServiceInstances()
Cfg -> Cfg : validateEnvironment()

Factory -> Factory : Get all configs
Factory -> Factory : For each config\ninstantiate class

Factory -> SM : Register service\n(serviceName, instance)

SM -> SM : Initialize service\n(new ServiceClass(config))

note over SM
  Service instance created:
  - this.config = parsed config
  - this.enabled = checkConfig()
  - Ready for health/stats
end note
@enduml
```

### API Endpoint Registration

```plantuml
@startuml
!theme plain

participant "serviceFactory.js" as Factory
participant "Express App" as App
participant "Middleware Stack" as MW

Factory -> Factory : createServiceRoutes(serviceId)

note over Factory
  Generates routes:
  GET /api/{serviceId}/status
  GET /api/{serviceId}/stats
end note

Factory -> App : Register routes with\nmiddleware chain

App -> MW : healthLimiter\nserviceEnabledMiddleware\nhealthCacheMiddleware

note right of MW
  Health check middleware:
  1. Rate limit: 30/min
  2. Service enabled check
  3. Cache (30s TTL)
end note

App -> MW : statsLimiter\nrequireAuth\nstatsCacheMiddleware

note right of MW
  Stats middleware:
  1. Rate limit
  2. JWT authentication
  3. Cache (60s TTL)
end note
@enduml
```

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/components/index|Components Index]]
