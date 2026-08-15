---
name: add-service
description: Add or modify a Watchman monitored-service integration. Use for new service types, multi-instance support, health checks, polling, service statistics, BaseService, ServiceRegistry, or service configuration changes.
---

# Add or change a Watchman service

Read `docs/guides/adding-services.md` and the relevant `docs/integrations/` page first.

1. Implement the service under `apps/backend/src/domain/services/` as a `BaseService` subclass with
   `checkHealth()` and `getStats()`.
2. Register and start it through `bootstrap/registerServices.ts` and `ServiceLifecycle`.
3. Reuse `apps/backend/src/infra/` transport, cache, circuit-breaker, and scheduler components.
4. Store service and multi-instance configuration in DuckDB through `/config` or the UI. Add an
   environment variable only for a genuine process setting.
5. If the API changes, update `apps/backend/openapi.yaml`, run `npm run generate:types`, and keep
   the hand-maintained API client types aligned.
6. Add frontend behavior through React Query and the existing API client.

Verify health, timeout, retry, circuit-breaker behavior, secrets, and multiple instances. Update
the integration documentation with the `update-watchman-docs` skill.
