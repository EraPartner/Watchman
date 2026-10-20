---
title: "Hook: useFrontendConfig (replaces useConfig)"
type: component
status: superseded
date: 2026-10-20
tags: [hook, frontend, react, config]
description: React Query frontend configuration hook; legacy useConfig hook removed
aliases: [use frontend config, use config, config hook]
---

# Hook: useFrontendConfig (replaces useConfig)

> [!danger] Superseded — No Longer Implemented
> Neither `useConfig` nor `useFrontendConfig` exists in `apps/frontend/src`, and the backend has no `GET /api/config/frontend` route. Service configuration is read through the `/config/*` API (see [[docs/api/config|Configuration API]]). Content retained for archival reference only.

> [!abstract] Overview
> Historical: frontend configuration was fetched via `useFrontendConfig`, a React Query hook that replaced the older `useConfig` hook (`use-config.tsx`).

## Purpose

Fetch runtime frontend configuration from `GET /api/config/frontend` and expose it via React Query cache so other hooks/components can share the same source of truth.

## Export

### `useFrontendConfig()`

```typescript
const { data, isLoading, error } = useFrontendConfig();
```

| Property    | Type                          | Description          |
| ----------- | ----------------------------- | -------------------- |
| `data`      | `FrontendConfig \| undefined` | Configuration object |
| `isLoading` | `boolean`                     | Loading state        |
| `error`     | `Error \| null`               | Error state          |

## Query Configuration

- Query key: `queryKeys.frontendConfig()` (`["frontend", "config"]`)
- `staleTime`: 60s
- `refetchInterval`: 60s
- `retry`: 1

## Config Shape

```typescript
interface FrontendConfig {
  services: {
    adguard: { webUrl: string };
    tor: { nickname?: string; ip?: string; port?: number; metricsUrl?: string };
  };
  app: { name: string; version: string };
}
```

## Behavior

- Fetches config from `GET /api/config/frontend`
- Shares cached config across hooks/components via React Query
- Used by `useEnabledServices` and service cards that need frontend runtime config

> [!warning] Removed (v2.3)
> Both `use-config.tsx` and `useFrontendConfig.ts` were removed when auth and frontend config endpoints were dropped. This document is preserved for historical reference.

## Usage Example

```tsx
import { useFrontendConfig } from "../hooks/useFrontendConfig";

function Header() {
  const { data: config, isLoading } = useFrontendConfig();

  if (isLoading) return null;

  return <h1>{config?.app.name}</h1>;
}
```

## Dependencies

- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/queryKeys.ts]]`

## Source

Files removed in v2.3: `apps/frontend/src/hooks/use-config.tsx`, `apps/frontend/src/hooks/useFrontendConfig.ts`

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/frontend-config|Frontend Config API]]
- [[docs/components/use-enabled-services|useEnabledServices]]
