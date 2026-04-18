---
title: Backend Rewrite with TypeScript and Fastify 4
type: adr
status: accepted
date: 2026-04-18
tags: [adr, backend, architecture, typescript, fastify, framework]
description: Decision to replace Express.js backend with TypeScript Fastify 4 using layered architecture with in-process caching and background polling
aliases: [backend rewrite, fastify migration, typescript backend]
---

# ADR-013: Backend Rewrite with TypeScript and Fastify 4

> [!abstract] Summary
> Replace the JavaScript Express backend with a fully typed TypeScript + Fastify 4 implementation using layered architecture (config → core → infra → domain → application → transport), in-process LRU caching with SWR pattern, croner-based background polling, and no external runtime dependencies (Redis, message queues, DI containers) for self-hosted single-node deployment.

## Status

- **Status**: Accepted
- **Date**: 2026-04-18
- **Supersedes**: None

## Context

The legacy backend (`apps/backend/server.js` and related Express middleware/routes) suffered from:

1. **Type Safety**: JavaScript without types led to runtime errors, harder debugging, and onboarding friction
2. **Framework Limitations**: Express required extensive custom middleware for HTTP/WebSocket/error handling; no built-in support for structured logging, typed request/response validation
3. **Architecture Ambiguity**: Service factory pattern, middleware chains, and route registration spread across many files with no clear layering
4. **Production Readiness**: Ad-hoc error handling, inconsistent logging, manual circuit breaker management, no metrics/observability
5. **Single-Node Assumption**: Caching and polling logic assumed single-node deployment; Redis/BullMQ would be overkill overhead for typical self-hosted scenarios

Watchman targets **self-hosted environments** (home labs, personal servers) where:
- Single-node deployment is the norm (not a cluster)
- Operational simplicity is paramount (minimal external services)
- Type safety reduces runtime surprises for non-dedicated DevOps teams
- In-process state is acceptable (polling state, response cache, circuit breaker state live in memory)

## Decision

Implement a new backend with the following properties:

### Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Fastify 4 (minimal, performant, typed plugins)
- **Language**: TypeScript (strict mode, full type coverage)
- **HTTP Client**: Undici (modern, performant, zero-copy streaming)
- **SSH**: ssh2 (existing library, widely used)
- **GPIO**: pigpio-client (for Raspberry Pi GPIO monitoring)
- **SNMP**: net-snmp (native SNMP queries)
- **Logging**: Pino (structured JSON, low overhead)
- **Polling**: croner (cron-like scheduling with jitter)
- **Caching**: lru-cache (in-process, no Redis)
- **Validation**: Zod (TypeScript-native schema validation)

### Layered Architecture

```
config/        → Environment, service registry (Zod validated)
↓
core/          → Logger, DomainError hierarchy, Result type, clock, eventBus, container
↓
infra/         → HTTP, SSH, GPIO, SNMP, cache, scheduler, circuitBreaker, metrics
↓
domain/        → BaseService, ServiceRegistry (keyed ${kind}:${instanceId})
↓
application/   → UseCases: GetServiceStatus, GetAggregatedHealth, ControlService, ListInstances
↓
transport/     → Fastify HTTP routes, WebSocket
```

Each layer has clear input/output contracts and minimal cross-layer coupling.

### In-Process State

- **Cache**: LRU-cache (bounded, no TTL complexity) with SWR (stale-while-revalidate) semantics
  - Health checks: 30s cache, serve stale while refetch in background
  - Stats endpoints: 60s cache
  - Bounded max entries prevents unbounded memory growth
- **Polling**: BackgroundPoller using croner + AbortSignal
  - Runs on configurable interval (default 15s)
  - Polls all enabled services in parallel
  - Emits status changes via eventBus for WebSocket broadcast
  - Integrates with circuit breaker (skip poll if circuit open)
- **Circuit Breaker**: Per-service state in memory
  - 5 failure threshold
  - 30s reset timeout
  - No external store needed; state is volatile (acceptable on restart)

### Error Handling

- `DomainError` hierarchy: NotFound, Unavailable, Unauthorized, Timeout, CircuitOpen, ValidationError
- `Result<T>` type for explicit success/failure semantics (eliminates unchecked exceptions)
- Structured error responses with error code, message, HTTP status
- Graceful degradation (cached data, fallback responses)

### WebSocket Architecture

Split into 4 focused classes:
- **AuthGate**: CORS/origin validation on handshake
- **ConnectionManager**: Track client connections, IP tracking
- **HeartbeatScheduler**: Ping/pong keep-alives
- **Broadcaster**: Publish status changes to connected clients

### Metrics & Observability

- `GET /metrics` endpoint returns JSON envelope:
  - Circuit breaker state per service
  - Poller statistics (runs, durations, failures)
  - Cache hits/misses
  - Process uptime, memory usage, event loop lag
- Structured logging via Pino (JSON format, request ID correlation)
- No external APM dependency

### Testing

- Vitest for unit and integration tests (237 tests across 33 files)
- 80%+ coverage across layers
- Mock HTTP clients, clock, eventBus, circuitBreaker

## Consequences

### Positive

- **Type Safety**: Full TypeScript coverage eliminates entire classes of runtime errors
- **Layered Clarity**: Each layer has a single responsibility; dependencies flow downward only
- **No Runtime Overhead**: No Redis, BullMQ, awilix—just Node.js + npm packages
- **Self-Contained Deployment**: Single process, no separate services to manage
- **Production Ready**: Structured logging, metrics, error handling, graceful shutdown
- **Testability**: Dependency injection via constructor, easy to mock
- **Performance**: Fastify is benchmarked faster than Express; Undici is zero-copy
- **Maintainability**: New contributors benefit from types; architecture is self-documenting

### Negative

- **Learning Curve**: Team must learn Fastify, TypeScript patterns, croner, Zod
- **In-Process Limits**: No horizontal scaling; single-node only (acceptable trade-off for self-hosted)
- **State Volatility**: Polling state, circuit breaker state, cache lost on restart (acceptable; services will re-stabilize quickly)
- **No External Persistence**: Can't share state across backend processes (not a requirement for self-hosted single-node)

### Risks

- **Breaking Changes**: API response formats may differ slightly from Express version (mitigated by comprehensive test coverage)
- **Third-Party Library Stability**: Croner, pigpio-client, net-snmp are less widely used than Express plugins (mitigated by abstraction layer; can swap implementations if needed)
- **Performance Regression**: If new backend performs worse, migration is partially wasted effort (mitigated by benchmarking before rollout)

## Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| **Nest.js** | Heavy framework; more than needed for single-node; steeper learning curve |
| **Continue Express** | No type safety; middleware chains become unmaintainable; hard to add observability |
| **Go (Gin/Echo)** | Forces team to learn Go; breaks npm workspaces monorepo; deployment more complex |
| **AWS Lambda/Serverless** | Overkill for self-hosted; polling/WebSocket unsupported; adds infrastructure complexity |
| **Add Redis + BullMQ** | Unnecessary overhead for single-node deployment; adds service dependency; violates YAGNI |
| **Use awilix DI** | Lighter than Nest, but adds abstraction layer that's overkill for single-node codebase |

## Implementation Details

### File Structure

```
apps/backend/
├── src/
│   ├── index.ts                # Composition root
│   ├── config/                 # Env validation, service registry
│   ├── core/                   # Logger, errors, Result, clock, eventBus, container
│   ├── infra/                  # HTTP, SSH, GPIO, SNMP, cache, scheduler, circuitBreaker, metrics
│   ├── domain/                 # BaseService, ServiceRegistry
│   ├── application/            # UseCases
│   ├── transport/
│   │   ├── http/               # Fastify routes
│   │   └── ws/                 # WebSocket classes
│   └── types/
│       └── ambient.d.ts        # Module augmentation stubs
├── dist/                       # Compiled JS
├── openapi.yaml                # OpenAPI spec (regenerated later)
├── tsconfig.json
├── vitest.config.ts
└── package.json                # Dependencies, build scripts
```

### Key Dependencies

- `fastify@^4.29.1` – HTTP framework
- `@fastify/compress` – Response compression
- `@fastify/websocket@^10.0.1` – WebSocket support
- `croner` – Cron-like scheduling
- `lru-cache` – In-process caching
- `pino` – Structured logging
- `zod` – Schema validation
- `undici` – HTTP client
- `ssh2`, `net-snmp`, `pigpio-client` – Protocol libraries
- `ws` – WebSocket client (for tests)

### Build & Run

- `npm run build` → TypeScript → `dist/index.js`
- `npm run dev` → `tsx watch src/index.ts` (development)
- `npm run test` → vitest (unit + integration tests)
- `npm run typecheck` → `tsc --noEmit`

### Backward Compatibility

- REST API response format remains the same (success/data/error envelope)
- All existing endpoints maintained: `/api/services`, `/api/{service}/status`, `/api/{service}/stats`, etc.
- WebSocket message format unchanged
- Auth (JWT cookies) unchanged
- Rate limiting tier names unchanged

## References

- [[docs/architecture/backend-architecture|Backend Architecture]] (updated with new layered structure)
- [[docs/features/real-time-updates|Real-Time Updates]] (updated WebSocket split)
- [[docs/integrations/index|Service Integrations]] (updated service pattern reference)
- [[docs/api/index|API Documentation]] (OpenAPI spec regeneration flagged as follow-up)
- [[docs/adr/012-backend-framework-module-system|ADR-012: Module System]] (superseded by this decision on framework choice)
- Related code: `[[apps/backend/src/index.ts]]`, `[[apps/backend/src/config/]]`, `[[apps/backend/src/core/]]`, `[[apps/backend/src/infra/]]`, `[[apps/backend/src/domain/]]`, `[[apps/backend/src/application/]]`, `[[apps/backend/src/transport/]]`
