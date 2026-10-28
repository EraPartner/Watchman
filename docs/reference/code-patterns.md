---
title: Code Patterns
type: reference
status: active
date: 2026-10-28
tags: [reference, code-patterns, backend, frontend, configuration, zod, mutex]
description: Standard code patterns and conventions used across the Watchman codebase
aliases: [patterns, conventions, code style, best practices]
---

# Code Patterns

> [!abstract] Overview
> Standard patterns and conventions used throughout the Watchman codebase.

## Backend Patterns

### Service Class Pattern

Every service follows this structure:

```javascript
export default class ServiceName {
  constructor(config) {
    this.name = "service-name";
    this.config = config;
    this.enabled = this.checkConfig();
  }

  checkConfig() {
    // Return true if service is properly configured
  }

  async checkHealth() {
    // Lightweight ping - returns { status, timestamp, data? }
  }

  async getStats() {
    // Detailed metrics - returns { data, timestamp }
  }
}
```

### Service Registration Pattern

Services are registered in [[apps/backend/src/domain/ServiceRegistry.ts|ServiceRegistry]]:

```typescript
// apps/backend/src/domain/ServiceRegistry.ts
export class ServiceRegistry {
  static register(service: BaseService): void { ... }
  static get(id: string): BaseService | undefined { ... }
  static getAll(): BaseService[] { ... }
}
```

Services are instantiated by kind via `ServiceFactory` and wired into the `BackgroundPoller` at bootstrap.

### Route Plugin Pattern (Fastify v4)

Each transport concern is a Fastify plugin registered in `[[apps/backend/src/transport/http/server.ts]]`:

```typescript
import fp from "fastify-plugin";

const serviceRoutes = fp(async (fastify) => {
  fastify.get("/services/:id/health", async (req, reply) => {
    // Handler
  });
});
```

### Error Handling Pattern

```javascript
try {
  const result = await service.doSomething();
  res.json(result);
} catch (error) {
  logger.error("Operation failed", { error: error.message });
  res.status(500).json({
    error: "User-friendly error message",
    message: error.message,
  });
}
```

### Logging Pattern

```javascript
import logger from "../middleware/logger.js";

logger.info("General information");
logger.error("Error message", { error: error.message, context });
logger.service("service-name", "Service-specific message");
logger.startup("Startup message");
logger.progress("Progress message");
logger.warning("Warning message");
```

## Frontend Patterns

### Frontend Logging Pattern

Prefer the frontend logger utility for diagnostics in hooks/components instead of direct `console.*` calls:

```typescript
import { logger } from "@/lib/logger";

logger.warn("Recoverable frontend issue", { context: "useAuth" });
logger.error("Unhandled UI error", { error, componentStack });
```

Use `unknown` in catch blocks and narrow before logging details where needed.

Related files: `[[apps/frontend/src/lib/logger.ts]]`, `[[apps/frontend/src/hooks/useWebSocket.ts]]`, `[[apps/frontend/src/components/ErrorBoundary.tsx]]`.

Redaction behavior note: in `[[apps/frontend/src/lib/logger.ts]]`, when a redaction regex matches without a capture group, the replacement falls back to `[REDACTED]`.

Coverage reference: `[[apps/frontend/src/lib/logger.test.ts]]` validates this fallback branch and standard redaction behavior.

### ServiceRenderer Registry Pattern (Phase 3 — Bento Dashboard)

The bento dashboard uses a **service-renderer registry** to drive customization per service without duplicating the `<ServiceTile>` component. Each service has one file in `apps/frontend/src/services/renderers/` that exports a `ServiceRenderer` object:

```typescript
// apps/frontend/src/services/renderers/bitcoin.ts
import type { ServiceRenderer } from "./types";

export const bitcoinRenderer: ServiceRenderer<BitcoinStats> = {
  // Summary metrics displayed in the tile
  summaryMetrics: ["block_height", "peers", "mempool_size"],

  // Detailed view groups and charts
  detailGroups: [
    {
      title: "Blockchain",
      metrics: ["block_height", "difficulty"],
      charts: ["block_height"],
    },
    {
      title: "Network",
      metrics: ["peers", "version"],
    },
  ],

  // Tile styling
  tone: "luxury",
  size: "xl", // xl, l, m, s
  density: "compact",

  // Format specific metrics
  formatters: {
    block_height: (v) => `#${v.toLocaleString()}`,
    peers: (v) => `${v} peers`,
  },
};
```

The registry index (`apps/frontend/src/services/renderers/index.ts`) maps service kinds to renderers:

```typescript
import { bitcoinRenderer } from "./bitcoin";
import { synologyRenderer } from "./synology";
// ... 12 more services

export const RENDERERS: Record<string, ServiceRenderer> = {
  bitcoin: bitcoinRenderer,
  synology: synologyRenderer,
  // ...
};
```

**Why this pattern:**
- **No duplication**: One tile component reused for all services
- **Extensibility**: Add new service without touching tile code
- **Consistency**: All services share the same layout, behavior, and styling constraints
- **Rule of 3+**: Used across 14+ services (violated by 18 inline `*Card.tsx` files)

### Custom Hook Pattern

```tsx
export function useServiceName() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch data
    return () => {
      // Cleanup
    };
  }, []);

  return { data, loading };
}
```

### API Client Pattern

```typescript
// Typed endpoint methods wrap the root-mounted routes (no /api prefix)
const health = await apiClient.getServiceHealth("adguard", "main"); // GET /services/adguard/health?instance=main
return health;
```

### DuckDB Time Conversion Pattern

> [!warning] Not in the current code
> This pattern described a `toTs()` helper in `apps/backend/src/infra/timeseries/duckdbTime.ts` for binding `Date` values in time-series queries. That module and the `metric_raw` time-series table do not exist in the current backend. DuckDB access goes through `apps/backend/src/infra/db/DuckDbPool.ts` (`withConnection()`), used by `ConfigStore` and `ProfileStore`.

`DuckDbPool.ts` does export a `toTs()` / `fromTs()` pair for the config and profile stores'
`TIMESTAMP` columns. `toTs(date)` binds a `Date` as UTC epoch microseconds. `fromTs(value)` is
its inverse for values read back: it reads the micros directly (or treats a naive
`YYYY-MM-DD HH:MM:SS[.ffffff]` string as UTC), so `created_at`, `updated_at` and audit `ts` come
back as the same instant whatever the host time zone. Never use `new Date(String(v))` on a
`TIMESTAMP` value: it parses the zone-less text as host-local time.

### Per-Kind Zod Schema + UI Field Metadata Pattern

Each service kind has a Zod instance schema and a list of UI field metadata. They live in two
files, not one file per kind:

- `[[apps/backend/src/config/services.ts]]` — the instance schemas (`BitcoinInstanceSchema`, …),
  built on a shared `BaseInstanceSchema` (`instanceId`, `enabled`, `pollPolicy`, `cacheTtlMs`,
  `timeoutMs`) and combined into the `ServiceInstanceSchema` union.
- `[[apps/backend/src/config/schemas/fieldMetadata.ts]]` — `KIND_META`, one entry per kind with
  its label, schema, form fields and `secretFields`.

```typescript
// apps/backend/src/config/services.ts
export const BitcoinInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("bitcoin"),
  rpcUrl: z.string().url().default("http://127.0.0.1:8332"),
  rpcUser: z.string().default(""),
  rpcPassword: z.string().default(""),
  zmqHashblockEndpoint: z.string().default(""),
  zmqRawtxEndpoint: z.string().default(""),
});

// apps/backend/src/config/schemas/fieldMetadata.ts (excerpt)
bitcoin: {
  kind: "bitcoin",
  label: "Bitcoin Node",
  description: "Bitcoin Core JSON-RPC.",
  schema: BitcoinInstanceSchema,
  fields: withCommon([
    { name: "rpcUrl", label: "RPC URL", type: "url", required: true, default: "http://127.0.0.1:8332" },
    { name: "rpcUser", label: "RPC user", type: "text", help: "Required: without RPC credentials both health and stats fail, so the node shows offline. Cookie auth is not supported; …" },
    { name: "rpcPassword", label: "RPC password", type: "password", secret: true },
    // zmqHashblockEndpoint, zmqRawtxEndpoint …
  ]),
  secretFields: ["rpcPassword"],
},
```

Field `type` is one of `text`, `password`, `number`, `url`, `boolean`, `select`, `stringArray`,
`numberArray`. `withCommon()` prepends the shared `instanceId`, `enabled`, `cacheTtlMs` and
`timeoutMs` fields.

**Why this pattern:**
- **Server validation**: the backend parses every config write with the kind's Zod schema
- **Type safety**: `z.infer<>` generates the instance types
- **Dynamic UI**: `GET /config/kinds` serves `KIND_META`, and the frontend builds forms from it
  without hardcoding
- **Secret handling**: `secretFields` marks fields that are encrypted at rest, redacted in
  responses, and redacted in logs

`[[apps/backend/src/config/schemas/index.ts]]` re-exports `KIND_META`, `SERVICE_KINDS` and the
helpers for the routes.

### Mutex-Serialized Lifecycle Pattern

Hot-reload of service configurations requires serialized state transitions to avoid race conditions. Use `Async.Mutex` from the `async` package:

```typescript
// apps/backend/src/application/ServiceLifecycle.ts
import { Mutex } from "async";

export class ServiceLifecycle {
  private configMutex = new Mutex();

  constructor(private poller: BackgroundPoller, private eventBus: EventBus) {
    this.eventBus.on("config:service.created", (event) => this.onCreated(event));
    this.eventBus.on("config:service.updated", (event) => this.onUpdated(event));
    this.eventBus.on("config:service.deleted", (event) => this.onDeleted(event));
  }

  private async onUpdated(event: ConfigServiceUpdatedEvent) {
    // Lock prevents concurrent mutations
    await this.configMutex.runExclusive(async () => {
      const oldService = ServiceRegistry.get(event.id);
      if (!oldService) return;

      // Pause polling to allow in-flight requests to drain
      this.poller.pause();
      try {
        // Clean up old service
        await oldService.onStop?.();

        // Create and start new service
        const newService = ServiceFactory.createService(
          event.kind,
          event.config,
          this.infra
        );
        await newService.onStart?.();

        // Update registry
        ServiceRegistry.update(newService);

        // Retrack in poller
        this.poller.untrack(oldService.id);
        this.poller.retrack(newService);
      } finally {
        // Always resume even on error
        this.poller.resume();
      }

      // Emit applied event for WebSocket broadcast
      this.eventBus.emit("service.config.applied", {
        id: newService.id,
      });
    });
  }
}
```

**Why this pattern:**
- **Prevents race conditions**: Mutex ensures only one config change executes at a time
- **Graceful poller coordination**: Pause allows in-flight polls to finish before state change
- **Error safety**: `finally` block ensures poller resumes even if intermediate steps fail
- **WebSocket-friendly**: Emits reduced events for broadcast (no secrets)

## Naming Conventions

| Element       | Convention                  | Example            |
| ------------- | --------------------------- | ------------------ |
| Service class | PascalCase + Service suffix | `AdGuardService`   |
| Service route | lowercase                   | `adguard`          |
| Env vars      | UPPER_SNAKE_CASE            | `ADGUARD_MAIN_URL` |
| Components    | PascalCase                  | `AdGuardCard`      |
| Hooks         | camelCase + use prefix      | `useAuth`          |
| Middleware    | camelCase                   | `requireAuth`      |

## Related

- [[docs/guides/contributing|Contributing Guide]]
- [[docs/guides/adding-services|Adding Services Guide]]

## PlantUML Diagrams

### Service Class Pattern

```plantuml
@startuml
!theme plain

class "ServiceName" {
    +name: string
    +config: object
    +enabled: boolean

    +checkConfig(): boolean
    +checkHealth(): Promise<HealthResult>
    +getStats(): Promise<StatsResult>
}

note right of ServiceName
  Every service follows
  this interface pattern
end note
@enduml
```

### Factory Registration Pattern

```plantuml
@startuml
!theme plain

package "serviceFactoryConfig.js" as Factory {
    object "serviceFactoryConfigs" as Config {
        servicename: {
            ServiceClass,
            getConfig(),
            required,
            postInit
        }
    }
}

package "ServiceManager" as SM {
    [services Map]
    [getService()]
}

Factory --> SM : Registers all services

note right of Factory
  Each entry maps:
  - Service class
  - Config getter function
  - Lifecycle hooks
end note
@enduml
```

### Middleware Chain Pattern

```plantuml
@startuml
!theme plain

participant "Request" as Req
participant "Rate Limiter" as Rate
participant "Auth" as Auth
participant "CSRF" as CSRF
participant "Service Check" as Svc
participant "Cache" as Cache
participant "Handler" as Handler

Req -> Rate : Request arrives
Rate -> Rate : Check quota

alt Rate Exceeded
    Rate --> Req : 429
else OK
    Rate -> Auth : Validate JWT
    Auth -> Auth : Check token
    Auth -> CSRF : Verify CSRF
    CSRF -> Svc : Check service enabled
    Svc -> Cache : Check cache
    Cache -> Handler : Execute handler
    Handler --> Req : Response
end
@enduml
```
