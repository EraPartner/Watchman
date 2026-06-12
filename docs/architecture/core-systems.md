---
title: Core Systems - Event Bus and Service Lifecycle
type: architecture
status: active
date: 2026-06-12
tags:
  [
    architecture,
    backend,
    core,
    event-bus,
    service-lifecycle,
    snapshot-cache,
    circuit-breaker,
    metrics,
  ]
description: EventBus pub/sub system, service lifecycle orchestration, SnapshotCache, circuit breaker wiring, and MetricsRegistry
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
  "service.health.updated": {
    id: string;
    kind: string;
    instanceId: string;
    at: number;
    snapshot?: HealthSnapshot;
  };
  "service.stats.updated": {
    id: string;
    kind: string;
    instanceId: string;
    at: number;
    snapshot?: StatsSnapshot;
  };
  "service.error": {
    id: string;
    kind: string;
    instanceId: string;
    scope: "health" | "stats";
    error: unknown;
    at: number;
  };
  "config:service.created": {
    id: string;
    kind: string;
  };
  "config:service.updated": {
    id: string;
    kind: string;
  };
  "config:service.deleted": {
    id: string;
    kind: string;
  };
  "config:service.renamed": {
    id: string;
    kind: string;
    oldInstanceId: string;
    newInstanceId: string;
  };
  "cache:revalidate.failed": {
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
    console.error("eventBus onError threw", e2);
  }
};
```

### Common Event Sources

| Event                     | Emitter                                              | Trigger                                                 |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `service.health.updated`  | [[apps/backend/src/infra/scheduler/poller.ts]]       | Health check completes                                  |
| `service.stats.updated`   | [[apps/backend/src/infra/scheduler/poller.ts]]       | Stats fetch completes                                   |
| `service.error`           | [[apps/backend/src/infra/scheduler/poller.ts]]       | Poll fails (health or stats)                            |
| `config:service.created`  | [[apps/backend/src/application/ServiceLifecycle.ts]] | New service instance created                            |
| `config:service.updated`  | [[apps/backend/src/application/ServiceLifecycle.ts]] | Service config updated                                  |
| `config:service.deleted`  | [[apps/backend/src/application/ServiceLifecycle.ts]] | Service deleted                                         |
| `config:service.renamed`  | [[apps/backend/src/config/store/ConfigStore.ts]]     | Service instanceId renamed (in addition to `updated`)   |
| `cache:revalidate.failed` | [[apps/backend/src/infra/cache/swr.ts]]              | SWR stale-branch revalidation fails (optional EventBus) |

### Event Subscribers

| Subscriber                          | Subscribes To                                                                     | Action                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| WebSocket Broadcaster               | `service.health.updated`, `service.stats.updated`, `service.error`, `config:*`    | Broadcast frames; alert on first error, info on recovery                    |
| SnapshotCache                       | `service.health.updated`, `service.error` (scope=health), `service.stats.updated` | Keep latest health result and stats per service for read-through HTTP layer |
| Time-Series Writer                  | `service.stats.updated`, `service.health.updated`                                 | Write metrics to DuckDB (when TIMESERIES_ENABLED)                           |
| Service Lifecycle (restart handler) | `config:service.created/updated/deleted`                                          | Reload affected service                                                     |

## Service Lifecycle Orchestration

`[[apps/backend/src/application/ServiceLifecycle.ts]]` – Manages service startup, shutdown, and hot-reload with serialized queue semantics.

### Purpose

Service lifecycle ensures that runtime service changes (create, update, delete) are applied safely without race conditions or state corruption.

### Key Operations

| Operation      | Method            | Description                                               |
| -------------- | ----------------- | --------------------------------------------------------- |
| Start all      | `start()`         | Load all services from store, register, and start polling |
| Stop all       | `stop()`          | Untrack all services, stop polling, call `onStop` hooks   |
| Reload all     | `reloadAll()`     | Stop all, then start all                                  |
| Create service | `applyCreate(id)` | Fetch stored config, bring up new service, emit event     |
| Update service | `applyUpdate(id)` | Pause polling, teardown old, bringup new, resume, emit    |
| Delete service | `applyDelete(id)` | Teardown service, emit event                              |

### Serialization Pattern

The lifecycle uses a **promise chain** to serialize operations:

```typescript
let chain: Promise<void> = Promise.resolve();

const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
  // Chain catches are swallowed so one failed op doesn't poison the queue.
  const next = chain.catch(() => undefined).then(fn);
  chain = next.then(
    () => undefined,
    () => undefined
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
  lifecycle.applyCreate("svc-1"), // Op 1
  lifecycle.applyUpdate("svc-2"), // Op 2 — waits for op 1, runs independently
  lifecycle.applyDelete("svc-3"), // Op 3 — waits for op 2, runs independently
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
3. Optionally wrap with circuit breakers + SWR stats cache via the `instrument` hook (wired in `index.ts`)
4. Call `service.onStart()` if defined — raced against `onStartTimeoutMs` (default 10 s); all services brought up concurrently so one slow `onStart` does not block others
5. Register in registry
6. Track in poller (start polling)
7. Record stored-to-runtime ID mapping

### Options

`ServiceLifecycleOptions`:

| Option             | Default | Description                                                                                                                                                                                                    |
| ------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onStartTimeoutMs` | `10000` | Per-service `onStart()` deadline (ms). Exceeded → error logged, service skipped but others continue.                                                                                                           |
| `instrument`       | _none_  | Optional `{ wrap, release }` hook. `wrap(svc)` called on bring-up to layer breakers/caches; `release(id)` called on teardown to free them. Used by `index.ts` to attach circuit breakers and SWR stats caches. |

## SnapshotCache

`[[apps/backend/src/application/SnapshotCache.ts]]` – Read-through cache between the HTTP routes and live services.

### Purpose

Prevents `GET /services` and `GET /services/:kind/health` from fanning out live probes on every HTTP read. Instead, those routes serve the most-recently-published poller result. The first request before any poll has completed falls back to a live probe.

### Health Cache

- Keyed by service id (`${kind}:${instanceId}`)
- Updated from `service.health.updated` bus events (when snapshot present)
- Updated with an error result from `service.error` events where `scope === "health"`
- Served as `Result<HealthSnapshot, DomainError>`

### Stats Cache (SWR)

- One `SwrCache<StatsSnapshot>` per service instance
- Each instance's `cacheTtlMs` config is honored as the SWR TTL
- Updated from `service.stats.updated` bus events; live probe is the miss handler
- `GET /services/:kind/stats` reads through this cache

### MetricsRegistry Integration

Stats cache instances register themselves in `MetricsRegistry` under `{id}:stats` so their hit/miss/stale counters appear in `GET /metrics`.

## Circuit Breaker Wiring

`[[apps/backend/src/infra/circuitBreaker/guardedService.ts]]` — `withBreakers(inner, breakers)` wraps a service in a `BreakerGuardedService` that routes `checkHealth()` and `getStats()` calls through separate `Breaker` instances.

### Per-Service Wiring (index.ts)

At bring-up, `index.ts` creates **two breakers** per service instance:

| Breaker       | Policy                                                      |
| ------------- | ----------------------------------------------------------- |
| `{id}:health` | failureThreshold 5, resetAfterMs 60 000, halfOpenMaxCalls 1 |
| `{id}:stats`  | failureThreshold 5, resetAfterMs 60 000, halfOpenMaxCalls 1 |

Health and stats are kept separate so a stats-only failure (e.g. bad credentials) cannot open the health circuit and hide the service as unreachable.

### CIRCUIT_OPEN result

When a breaker is open, `execResult()` returns `err(UnavailableError("CIRCUIT_OPEN"))` rather than throwing, preserving the `Result<T, DomainError>` contract for callers.

### Metrics

Breaker state is registered in `MetricsRegistry` under `{id}:health` and `{id}:stats`. `GET /metrics` → `snapshot.breakers` includes state, `openedAt`, and failure counts. On teardown `removeBreaker(name)` is called via the `instrument.release` hook.

### Related

- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/adr/003-central-service-orchestration|ADR-003: Service Orchestration]]
- [[docs/features/real-time-updates|Real-Time Updates]]
- [[docs/performance/caching-strategies|Caching Strategies]]
