---
title: "Hook: useServiceHealth"
type: component
status: active
date: 2026-10-28
tags: [hook, frontend, react, health, stats, query]
description: Read-only React Query hooks for per-service health (from the aggregated endpoint) and per-tile stats
aliases: [use service health, service stats]
---

# Hook: useServiceHealth

> [!abstract] Overview
> Read-only hooks for one service's health and stats. Health comes from the shared aggregated
> `/services` query, so many tiles cost one request. Stats are fetched per tile. There are no
> mutation hooks here: Watchman never changes a monitored service
> ([[docs/adr/032-monitoring-only-no-service-control|ADR-032]]).

## Exports

### `useServiceHealth(kind, instance?)`

Picks one service's health from the aggregated query.

```typescript
const { data, isLoading, error } = useServiceHealth("adguard", "main");
```

- Backed by `useAggregatedHealth()` (query key `queryKeys.servicesHealth()`).
- Returns `{ data: HealthSnapshot | undefined, isLoading, error: { code, message } | undefined }`.

### `useServiceStats(kind, instance?, enabled = true, trackedMetrics = [])`

Fetches one service's stats.

```typescript
const { data, isLoading, error } = useServiceStats("adguard", "main", true, ["totalQueries"]);
```

**Query Configuration:**

- Query key: `queryKeys.serviceStats(kind)`, plus `instance` when given
- `refetchInterval`: 30 seconds
- `staleTime`: 15 seconds
- `retry`: 1
- Errors are thrown as `StatsApiError` with the parsed API error `code`.
- Each new snapshot records `trackedMetrics` into the in-memory metric history (sparklines).

### `useAggregatedHealth(refetchInterval = 10000)` / `useAllServicesHealth`

Re-exported from `useAggregatedHealth.ts`; `useAllServicesHealth` is an alias.

- Query key: `queryKeys.servicesHealth()`
- `refetchInterval`: 10 seconds by default, `staleTime` half of it, `retry`: 2

### `StatsApiError`

`Error` subclass with a `code` field, so tiles can branch on the API error code.

## Usage Example

```tsx
import { useServiceHealth, useServiceStats } from "../hooks/useServiceHealth";

function AdGuardSummary() {
  const health = useServiceHealth("adguard");
  const stats = useServiceStats("adguard");

  return <p>{health.data?.reachable ? "up" : "down"} · {String(stats.data?.metrics.totalQueries ?? "—")}</p>;
}
```

## Dependencies

- `@tanstack/react-query` — `useQuery`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/queryKeys.ts]]`

## Source

- [[apps/frontend/src/hooks/useServiceHealth.ts]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/services-health|Services Health API]]
- [[docs/components/use-services-health|useServicesHealth]]
