---
title: "Hook: useEnabledServices"
type: component
status: active
date: 2026-04-09
tags: [hook, frontend, react, config, feature-flag]
description: React Query hook for determining which services are enabled via environment configuration
aliases: [use enabled services, enabled services hook, service config]
---

# Hook: useEnabledServices

> [!abstract] Overview
> A React Query hook that fetches the frontend configuration and provides an `isServiceEnabled()` helper to check if individual services are active.

## Purpose

Centralizes the logic for determining which service cards should be rendered based on the `ENABLED_SERVICES` environment variable. Prevents unnecessary API calls to disabled services.

## Exports

### `useEnabledServices()`

```typescript
const { enabledServices, isServiceEnabled, isLoading, error } =
  useEnabledServices();
```

| Property                 | Type                        | Description                            |
| ------------------------ | --------------------------- | -------------------------------------- |
| `enabledServices`        | `string[]`                  | Array of enabled service identifiers   |
| `isServiceEnabled(name)` | `(name: string) => boolean` | Check if a specific service is enabled |
| `isLoading`              | `boolean`                   | Loading state                          |
| `error`                  | `Error \| null`             | Error state                            |

**Query Configuration:**

- Query key: `["frontend", "config"]`
- `staleTime`: `Infinity` (config rarely changes)
- `retry`: 2

## Behavior

- Fetches config from `GET /api/config/frontend` via `apiClient`
- `isServiceEnabled()` returns `false` while data is still loading (prevents premature API requests)
- Service names are compared case-insensitively
- Returns `false` for any service not in the enabled list

## Usage Example

```tsx
import { useEnabledServices } from "../hooks/useEnabledServices";

function Dashboard() {
  const { isServiceEnabled } = useEnabledServices();

  return (
    <div>
      {isServiceEnabled("adguard") && <AdGuardCard />}
      {isServiceEnabled("bitcoin") && <BitcoinCard />}
      {isServiceEnabled("tor") && <TorCard />}
    </div>
  );
}
```

## Dependencies

- `@tanstack/react-query` — `useQuery`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/queryKeys.ts]]`
- `[[apps/frontend/src/hooks/useFrontendConfig.ts]]` (shared query key consumer)

## Source

- [[apps/frontend/src/hooks/useEnabledServices.ts]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/frontend-config|Frontend Config API]]
- [[docs/features/multi-instance|Multi-Instance Support]]
