---
title: "Hook: useServicesHealth"
type: component
status: deprecated
date: 2026-04-09
tags: [hook, frontend, react, health, query, deprecated]
description: Legacy doc for removed useServicesHealth hook; functionality now provided by hooks in useServiceHealth.ts and queryKeys
aliases: [use services health, services health hook, aggregate health]
---

# Hook: useServicesHealth

> [!abstract] Overview
> `useServicesHealth.ts` has been removed. Aggregate health and frontend config querying now live in other hooks using centralized query keys.

## Current Replacement

- Aggregate services health: `useAllServicesHealth()` from `[[apps/frontend/src/hooks/useServiceHealth.ts]]`
- Frontend config: `useFrontendConfig()` from `[[apps/frontend/src/hooks/useFrontendConfig.ts]]`
- Query keys are centralized in `[[apps/frontend/src/lib/queryKeys.ts]]`

## Legacy API (for historical context)

### `useServicesHealth()` (removed)

```typescript
const { data, isLoading, error, refetch } = useServicesHealth();
```

| Property    | Type            | Description                         |
| ----------- | --------------- | ----------------------------------- |
| `data`      | `ServiceHealth` | Map of service name → health result |
| `isLoading` | `boolean`       | Loading state                       |
| `error`     | `Error \| null` | Error state                         |
| `refetch`   | `() => void`    | Manual refetch function             |

**Query Configuration:**

- Query key: `["services-health"]`
- `staleTime`: 5 seconds
- `refetchInterval`: `APP_CONFIG.ADGUARD_REFRESH_INTERVAL`
- `retry`: 1

### `useFrontendConfig()` (moved)

```typescript
const { data, isLoading, error } = useFrontendConfig();
```

| Property    | Type             | Description                   |
| ----------- | ---------------- | ----------------------------- |
| `data`      | `FrontendConfig` | Frontend configuration object |
| `isLoading` | `boolean`        | Loading state                 |
| `error`     | `Error \| null`  | Error state                   |

**Query Configuration:**

- Query key: `["frontend-config"]`
- `staleTime`: 60 seconds
- `refetchInterval`: 60 seconds
- `retry`: 1

> [!note]
> Consolidation is complete for these paths: `use-config.tsx` and `useServicesHealth.ts` were removed; consumers should use `useFrontendConfig` and `useServiceHealth` exports.

## Usage Example

```tsx
import { useAllServicesHealth } from "../hooks/useServiceHealth";

function StatusOverview() {
  const { data, isLoading } = useAllServicesHealth();

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {Object.entries(data?.services || {}).map(([name, health]) => (
        <li key={name}>
          {name}: {health.status}
        </li>
      ))}
    </ul>
  );
}
```

## Dependencies

- `@tanstack/react-query` — `useQuery`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/queryKeys.ts]]`

## Source

- Current aggregate health source: [[apps/frontend/src/hooks/useServiceHealth.ts]]
- Current frontend config source: `apps/frontend/src/hooks/useFrontendConfig.ts`

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/services-health|Services Health API]]
- [[docs/components/use-service-health|useServiceHealth]]
