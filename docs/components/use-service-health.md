---
title: "Hook: useServiceHealth"
type: component
status: active
date: 2026-04-02
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

- Query key: `["service-health", serviceName]`
- `refetchInterval`: 10 seconds
- `staleTime`: 5 seconds
- `retry`: 2 with exponential backoff (max 30s)

### `useServiceStats(serviceName, enabled?)`

Fetches detailed statistics for a single service.

```typescript
const { data, isLoading } = useServiceStats("adguard", true);
```

**Query Configuration:**

- Query key: `["service-stats", serviceName]`
- `refetchInterval`: 30 seconds
- `staleTime`: 15 seconds
- `retry`: 1

### `useAllServicesHealth()`

Fetches health for all services (alternative to `useServicesHealth`).

```typescript
const { data } = useAllServicesHealth();
```

**Query Configuration:**

- Query key: `["all-services-health"]`
- `refetchInterval`: 15 seconds
- `staleTime`: 7.5 seconds
- `retry`: 2

> [!note] Overlap with useServicesHealth
> This hook and `[[docs/components/use-services-health|useServicesHealth]]` both call `apiClient.getServicesHealth()` but use different query keys and intervals. One should be consolidated.

### `useAdGuardProtectionToggle()`

Mutation hook for toggling AdGuard DNS protection.

```typescript
const toggle = useAdGuardProtectionToggle();
toggle.mutate({ enabled: true, duration: 3600 });
```

**Behavior:**

- Calls `POST /api/adguard/protection`
- Invalidates `["service-health", "adguard"]`, `["service-stats", "adguard"]`, and `["all-services-health"]` on success

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

## Source

- [[apps/frontend/src/hooks/useServiceHealth.ts]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/services-health|Services Health API]]
- [[docs/components/use-services-health|useServicesHealth]]
- [[docs/api/adguard|AdGuard API]]
