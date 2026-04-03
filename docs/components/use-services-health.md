---
title: "Hook: useServicesHealth"
type: component
status: active
date: 2026-04-02
tags: [hook, frontend, react, health, query]
description: React Query hook for fetching aggregate health of all enabled services
aliases: [use services health, services health hook, aggregate health]
---

# Hook: useServicesHealth

> [!abstract] Overview
> A React Query hook that fetches the aggregate health status of all enabled services from the `/api/services/health` endpoint.

## Purpose

Provides a convenient way to subscribe to the health status of all monitored services with automatic polling, caching, and retry logic.

## Exports

### `useServicesHealth()`

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

### `useFrontendConfig()`

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

> [!note] Consolidation Opportunity
> This hook overlaps with `[[docs/components/use-config-hook|useConfig]]` and `[[docs/components/use-enabled-services|useEnabledServices]]`. All three call `apiClient.getFrontendConfig()`. Consider consolidating to a single React Query-based config hook.

## Usage Example

```tsx
import { useServicesHealth } from "../hooks/useServicesHealth";

function StatusOverview() {
  const { data, isLoading } = useServicesHealth();

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
- `[[apps/frontend/src/lib/constants.ts]]` — `APP_CONFIG`

## Source

- [[apps/frontend/src/hooks/useServicesHealth.ts]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/services-health|Services Health API]]
- [[docs/components/use-service-health|useServiceHealth]]
