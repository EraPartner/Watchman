---
name: add-service
description: Add or modify a monitored service integration in Watchman — new service type, new instance support, health checks, polling, service stats. Use when the user wants to monitor something new, add/change a service integration, or touch BaseService/ServiceRegistry/service config.
---

# Adding / changing a service integration

Read first: `docs/guides/adding-services.md` and the relevant `docs/integrations/` spec
(CLAUDE.md mandate before any service change).

## The pattern

1. New service = a class in `apps/backend/src/domain/services/` extending `BaseService`
   (implement `checkHealth()` + `getStats()`).
2. Register it in `ServiceRegistry.ts` (registers + routes all service instances).
3. Use `src/infra/` building blocks (`http`, `ssh`, `snmp`, `net`, `gpio`, `roon`, `cache`,
   `circuitBreaker`, `scheduler`) — don't hand-roll transport or polling.
4. Service config — including multi-instance — lives in the **DuckDB config store**, managed
   through the `/config` API or the UI. Legacy `{SERVICE}_{N}_*` env vars are imported once on
   first boot and ignored after that, so adding a new one has no runtime effect. Only genuinely
   process-level settings belong in env; document those in
   `docs/reference/environment-variables.md`.
5. API surface changed? Update `apps/backend/openapi.yaml` (the API source of truth) and run
   `npm run generate:types` so `apps/frontend/src/types/generated.ts` stays in sync.
6. Frontend: components in `apps/frontend/src/components/`, data via React Query +
   `src/services/ApiClient.ts`.

## Verify (CLAUDE.md "service-integration change" tier)

Health check works · timeout/retry/circuit-breaker behavior · auth + rate-limit respected ·
multi-instance implications considered. Then update the `docs/integrations/` spec page via the
`watchman-kb-updater` subagent before marking work complete.
