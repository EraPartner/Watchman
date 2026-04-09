---
title: "Hook: useServiceHealth"
type: component
status: active
date: 2026-04-09
tags: [hook, frontend, react, health, stats, mutation, query]
description: React Query hooks for individual service health, stats, mutations, and cache management
aliases: [use service health, service stats, protection toggle, cache clear]
---

# Hook: useServiceHealth

> [!abstract] Overview
> A collection of React Query hooks for fetching individual service health/stats and performing mutations (AdGuard protection toggle, cache clearing).

## Exports

### `useServiceHealth(serviceName, options?)`

Fetches health status for a single service.

```typescript
const { data, isLoading, error } = useServiceHealth("adguard");
```

**Query Configuration:**

- Query key: `queryKeys.serviceStatus(serviceName)`
- `refetchInterval`: 10 seconds
- `staleTime`: 5 seconds
- `retry`: 2 with exponential backoff (max 30s)

### `useServiceStats(serviceName, enabled?)`

Fetches detailed statistics for a single service.

```typescript
const { data, isLoading } = useServiceStats("adguard", true);
```

**Query Configuration:**

- Query key: `queryKeys.serviceStats(serviceName)`
- `refetchInterval`: 30 seconds
- `staleTime`: 15 seconds
- `retry`: 1

### `useAllServicesHealth()`

Fetches aggregate health for enabled services.

```typescript
const { data } = useAllServicesHealth();
```

**Query Configuration:**

- Query key: `queryKeys.servicesHealth()`
- `refetchInterval`: 15 seconds
- `staleTime`: 7.5 seconds
- `retry`: 2

> [!note]
> Legacy `useServicesHealth.ts` has been removed. This hook now provides the aggregate-health path through `useAllServicesHealth()`.

### `useAdGuardProtectionToggle()`

Mutation hook for toggling AdGuard DNS protection.

```typescript
const toggle = useAdGuardProtectionToggle();
toggle.mutate({ enabled: true, duration: 3600 });
```

**Behavior:**

- Calls `POST /api/adguard/protection`
- Invalidates `queryKeys.serviceStatus("adguard")`, `queryKeys.serviceStats("adguard")`, `queryKeys.adguardFull()`, and `queryKeys.servicesHealth()` on success

### `useClearCache()`

Mutation hook for clearing backend response cache.

```typescript
const clearCache = useClearCache();
clearCache.mutate();
```

**Behavior:**

- Calls `POST /api/cache/clear` with type `"all"`
- Invalidates ALL React Query caches on success

## Usage Example

```tsx
import {
  useServiceHealth,
  useServiceStats,
  useAdGuardProtectionToggle,
} from "../hooks/useServiceHealth";

function AdGuardPanel() {
  const health = useServiceHealth("adguard");
  const stats = useServiceStats("adguard");
  const toggle = useAdGuardProtectionToggle();

  return (
    <div>
      <p>Status: {health.data?.status}</p>
      <button onClick={() => toggle.mutate({ enabled: false })}>
        Disable Protection
      </button>
    </div>
  );
}
```

## Dependencies

- `@tanstack/react-query` — `useQuery`, `useMutation`, `useQueryClient`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/queryKeys.ts]]`

## Source

- [[apps/frontend/src/hooks/useServiceHealth.ts]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/services-health|Services Health API]]
- [[docs/components/use-services-health|useServicesHealth]]
- [[docs/api/adguard|AdGuard API]]
