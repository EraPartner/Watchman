---
title: "Hook: useConfig"
type: component
status: active
date: 2026-04-02
tags: [hook, frontend, react, config, legacy]
description: Legacy configuration hook using useEffect and manual state management
aliases: [use config, config hook, legacy config]
---

# Hook: useConfig

> [!abstract] Overview
> A legacy configuration hook that uses `useEffect` and manual state management to fetch frontend configuration. Being consolidated in favor of React Query-based alternatives.

## Purpose

Original hook for fetching runtime configuration from the backend. Provides service URLs, app metadata, and feature flags. Includes hardcoded fallback values when the backend is unavailable.

> [!warning] Legacy Pattern
> This hook uses manual `useEffect` + `useState` instead of React Query. It duplicates functionality provided by `[[docs/components/use-enabled-services|useEnabledServices]]` and `[[docs/components/use-services-health|useFrontendConfig]]`. Consider migrating consumers to the React Query-based hooks.

## Exports

### `useConfig()`

```typescript
const { config, loading, error } = useConfig();
```

| Property  | Type                     | Description          |
| --------- | ------------------------ | -------------------- |
| `config`  | `FrontendConfig \| null` | Configuration object |
| `loading` | `boolean`                | Loading state        |
| `error`   | `string \| null`         | Error message        |

## Config Shape

```typescript
interface FrontendConfig {
  services: {
    adguard: { webUrl: string };
    tor: { nickname?: string; ip?: string; port?: number; metricsUrl?: string };
    nostrcheck?: {
      relayUrl?: string | null;
      webUrl?: string | null;
      enabled?: boolean;
      configured?: boolean;
    };
  };
  app: { name: string; version: string };
}
```

## Behavior

- Fetches config from `GET /api/config/frontend` on mount (once, no refetching)
- On failure, falls back to hardcoded values:
  - AdGuard URL: `http://127.0.0.1:5213`
  - Tor nickname: `"unknown"`
  - Nostrcheck: disabled
  - App name: `"Watchman Dashboard"`, version: `"1.0.0"`

> [!note] Hardcoded Fallbacks
> The fallback values are hardcoded and should come from environment variables or be removed. In production, these values will be incorrect if the backend is unavailable.

## Usage Example

```tsx
import { useConfig } from "../hooks/use-config";

function Header() {
  const { config, loading } = useConfig();

  if (loading) return null;

  return <h1>{config?.app.name}</h1>;
}
```

## Dependencies

- `[[apps/frontend/src/services/ApiClient|apiClient]]`

## Source

- [[apps/frontend/src/hooks/use-config.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/frontend-config|Frontend Config API]]
- [[docs/components/use-enabled-services|useEnabledServices]] (preferred alternative)
- [[docs/components/use-services-health|useFrontendConfig]] (preferred alternative)
