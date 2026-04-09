---
title: "Component: UpdateBadge"
type: component
status: active
date: 2026-04-09
tags: [component, frontend, react, shared, updates, version]
description: Displays update availability badge for services with clickable release notes link
aliases: [update badge, version badge, update available]
---

# Component: UpdateBadge

> [!abstract] Overview
> A badge component that checks for software updates for supported services and displays a clickable alert when an update is available.

## Purpose

Provides a visual indicator when a monitored service has a newer version available. Fetches update information from the backend's `/api/{service}/updates` endpoint and displays a destructive-styled badge with the latest version number.

## Props

| Prop        | Type                                                        | Required | Default | Description                             |
| ----------- | ----------------------------------------------------------- | -------- | ------- | --------------------------------------- |
| `service`   | `"adguard" \| "bitcoin" \| "tor" \| "ipfs" \| "homebridge"` | Yes      | —       | Service identifier to check updates for |
| `className` | `string`                                                    | No       | `""`    | Additional CSS classes                  |

## Behavior

- Fetches update info via React Query using `queryKeys.serviceUpdates(service)`
- Uses `apiClient.getServiceUpdates(service)` for update calls
- Uses a 6-hour stale/refetch interval for update freshness checks
- Shows a spinning "Checking..." badge while loading
- Silently hides on 503 (service not configured), matching prior behavior intent
- Hides on error or when no update is available
- Shows a red destructive badge with `AlertCircle` icon when update is available
- Clicking the badge opens the release URL in a new tab

## Implementation Notes

- The component now relies on React Query (`useQuery`) instead of local `useEffect` + `setInterval` polling.
- This is a refactor/performance hygiene change; update endpoint behavior and UI intent are unchanged.

## Internal State

```typescript
interface UpdateInfo {
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion: string;
  releaseUrl?: string;
  recommendedUrl?: string;
}
```

## Supported Services

| Service      | Update Source   |
| ------------ | --------------- |
| `adguard`    | GitHub releases |
| `bitcoin`    | GitHub releases |
| `tor`        | GitLab releases |
| `ipfs`       | GitHub releases |
| `homebridge` | npm registry    |

## Usage Example

```tsx
import { UpdateBadge } from "./UpdateBadge";

// In a service card
<div className="flex items-center gap-2">
  <h3>AdGuard Home</h3>
  <UpdateBadge service="adguard" />
</div>;
```

## Dependencies

- `lucide-react` — `AlertCircle`, `RefreshCw` icons
- `[[apps/frontend/src/components/ui/badge.tsx]]` — Badge component
- `[[apps/frontend/src/services/ApiClient.ts]]` — `getServiceUpdates(serviceKey)` helper
- `[[apps/frontend/src/lib/queryKeys.ts]]` — `serviceUpdates(serviceKey)` query key

## Source

- [[apps/frontend/src/components/UpdateBadge.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/api/index|API Index]] — Update endpoints
- [[apps/backend/utils/versionComparison.js|Version Comparison Utility]]
