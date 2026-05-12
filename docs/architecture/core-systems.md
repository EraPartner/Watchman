---
title: Core Systems - Event Bus and Service Lifecycle
type: architecture
status: active
date: 2026-04-19
tags: [architecture, backend, core, event-bus, service-lifecycle]
description: EventBus pub/sub system, service lifecycle orchestration, and error handling patterns
aliases: [event bus, core systems, eventbus, events]
---

# Core Systems: Event Bus and Service Lifecycle

> [!abstract] Overview
> The Watchman backend core layer provides a typed event bus for pub/sub communication and service lifecycle orchestration with error-safe handlers.

## Event Bus

`[[apps/backend/src/core/eventBus.ts]]` – Pub/sub event system with typed event payloads.

### EventMap

All events and their payloads are defined in a single TypeScript interface:

```typescript
interface EventMap {
  'service.health.updated': {
    id: string;
    kind: string;
    instanceId: string;
    at: number;
    snapshot?: HealthSnapshot;
  };
  'service.stats.updated': {
    id: string;
    kind: string;
    instanceId: string;
    at: number;
    snapshot?: StatsSnapshot;
  };
  'service.error': {
    id: string;
    error: unknown;
    at: number;
  };
  'config:service.created': {
    id: string;
    kind: string;
  };
  'config:service.updated': {
    id: string;
    kind: string;
  };
  'config:service.deleted': {
    id: string;
    kind: string;
  };
  'config:service.renamed': {
    id: string;
    kind: string;
    oldInstanceId: string;
    newInstanceId: string;
  };
  'cache:revalidate.failed': {
    key: string;
    error: string;
  };
}
```

### API

```typescript
interface EventBus {
  emit<K extends EventKey>(event: K, payload: EventMap[K]): void;
  on<K extends EventKey>(event: K, handler: Handler<EventMap[K]>): () => void;
}
```

- **`emit`** — Fire an event synchronously; handlers are invoked immediately
- **`on`** — Register a handler; returns an unsubscribe function

### Handler Safety

Handlers are invoked with comprehensive error isolation:

1. **Sync handler exceptions** – Caught and passed to `onError` callback
2. **Async handler rejections** – Caught via `.catch()` and passed to `onError`
3. **Error callback throwing** – Wrapped in try/catch with `console.error` fallback

This prevents a throwing handler or error callback from escaping as an unhandled promise rejection.

```typescript
const safeOnError = (err: unknown): void => {
  if (!onError) return;
  try {
    onError(err);
  } catch (e2) {
    // last-resort: a throwing onError would escape as unhandled rejection.
    console.error('eventBus onError threw', e2);
  }
};
```

### Common Event Sources

| Event                         | Emitter                                                      | Trigger                                                 |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `service.health.updated`      | [[apps/backend/src/infra/scheduler/poller.ts]]               | Health check completes                                  |
| `service.stats.updated`       | [[apps/backend/src/infra/scheduler/poller.ts]]               | Stats fetch completes                                   |
| `service.error`               | [[apps/backend/src/infra/scheduler/poller.ts]]               | Poll fails (health or stats)                            |
| `config:service.created`      | [[apps/backend/src/application/ServiceLifecycle.ts]]         | New service instance created                            |
| `config:service.updated`      | [[apps/backend/src/application/ServiceLifecycle.ts]]         | Service config updated                                  |
| `config:service.deleted`      | [[apps/backend/src/application/ServiceLifecycle.ts]]         | Service deleted                                         |
| `config:service.renamed`      | [[apps/backend/src/config/store/ConfigStore.ts]]             | Service instanceId renamed (in addition to `updated`)   |
| `cache:revalidate.failed`     | [[apps/backend/src/infra/cache/swr.ts]]                      | SWR stale-branch revalidation fails (optional EventBus) |

### Event Subscribers

| Subscriber                          | Subscribes To                                   | Action                                     |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| WebSocket Broadcaster               | `service.health.updated`, `service.stats.updated`, `config:*` | Broadcast to connected clients             |
| Time-Series Writer                  | `service.stats.updated`                         | Write metrics to DuckDB                    |
| Service Lifecycle (restart handler) | `config:service.created/updated/deleted`        | Reload affected service                    |

## Service Lifecycle Orchestration

`[[apps/backend/src/application/ServiceLifecycle.ts]]` – Manages service startup, shutdown, and hot-reload with serialized queue semantics.

### Purpose

Service lifecycle ensures that runtime service changes (create, update, delete) are applied safely without race conditions or state corruption.

### Key Operations

| Operation      | Method              | Description                                                |
| -------------- | ------------------- | ---------------------------------------------------------- |
| Start all      | `start()`           | Load all services from store, register, and start polling  |
| Stop all       | `stop()`            | Untrack all services, stop polling, call `onStop` hooks    |
| Reload all     | `reloadAll()`       | Stop all, then start all                                   |
| Create service | `applyCreate(id)`   | Fetch stored config, bring up new service, emit event      |
| Update service | `applyUpdate(id)`   | Pause polling, teardown old, bringup new, resume, emit     |
| Delete service | `applyDelete(id)`   | Teardown service, emit event                               |

### Serialization Pattern

The lifecycle uses a **promise chain** to serialize operations:

```typescript
let chain: Promise<void> = Promise.resolve();

const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
  // Chain catches are swallowed so one failed op doesn't poison the queue.
  const next = chain.catch(() => undefined).then(fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};
```

#### Semantics

- **Errors propagate to the immediate awaiter** – `applyCreate()` caller sees the error
- **Chain-continuation errors are intentionally swallowed** – One failed op does not prevent subsequent ops from running
- **All operations are always attempted** – Even if operation 2 fails, operation 3 will still run

#### Example

```typescript
// Three ops queued simultaneously:
await Promise.all([
  lifecycle.applyCreate('svc-1'),     // Op 1
  lifecycle.applyUpdate('svc-2'),     // Op 2 — waits for op 1, runs independently
  lifecycle.applyDelete('svc-3'),     // Op 3 — waits for op 2, runs independently
]);
// If op 2 fails, callers of applyUpdate see the error.
// Op 3 still runs regardless.
```

### Teardown

`teardown(svcId)`:

1. Untrack from poller (stop polling this service)
2. Unregister from registry (remove from `${kind}:${instanceId}` map)
3. Call `service.onStop()` if defined (catch and log errors)

### Bring-Up

`bringUp(stored)`:

1. Skip if service is disabled
2. Create service instance from stored config
3. Call `service.onStart()` if defined (catch and log errors)
4. Register in registry
5. Track in poller (start polling)
6. Record stored-to-runtime ID mapping

### Related

- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/adr/003-central-service-orchestration|ADR-003: Service Orchestration]]
- [[docs/features/real-time-updates|Real-Time Updates]]
