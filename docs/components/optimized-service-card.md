---
title: OptimizedServiceCard Component
type: component
status: deprecated
date: 2026-04-09
tags: [component, frontend, react, service-card, memo]
description: Base service card component with React.memo optimization and React Query data fetching for health and stats
aliases: [optimized service card, service card base]
---

# OptimizedServiceCard

> [!abstract] Summary
> A memoized React component that displays a service's health status and statistics using React Query for data fetching. Serves as the base template for individual service cards.

## Overview

`OptimizedServiceCard` is a reusable base component that wraps the common pattern of displaying service health and stats. It uses `React.memo` to prevent unnecessary re-renders and React Query hooks for data fetching.

## File Location

Removed from codebase during refactor. This document is retained for historical reference.

## Props

| Prop          | Type      | Default | Description                        |
| ------------- | --------- | ------- | ---------------------------------- |
| `serviceName` | `string`  | —       | Internal service identifier        |
| `displayName` | `string`  | —       | Human-readable service name        |
| `enableStats` | `boolean` | `true`  | Whether to fetch and display stats |

## Behavior

### Data Fetching

- Uses `useServiceHealth(serviceName)` for health status
- Uses `useServiceStats(serviceName, enableStats)` for detailed metrics
- Uses `useClearCache()` for cache invalidation

### Performance

- **`React.memo`** — Prevents re-renders when props haven't changed
- **Conditional stats loading** — Stats only fetched when `enableStats` is true
- **Combined loading state** — Shows spinner when either health or stats are loading

### UI Elements

- **Card header**: Display name, status badge, response time badge, refresh button, cache clear button
- **Card content**: Health status, stats grid (up to 4 entries), response time, last check time
- **Error state**: Red error message display
- **Loading state**: Centered spinner

### Actions

- **Refresh** — Triggers `refetchHealth()` to re-fetch health data
- **Clear Cache** — Calls `clearCacheMutation.mutate()` to clear React Query cache

## Usage

```tsx
import { OptimizedServiceCard } from "@/components/OptimizedServiceCard";

<OptimizedServiceCard
  serviceName="adguard"
  displayName="AdGuard Home"
  enableStats={true}
/>;
```

## Related Components

- [[docs/components/performant-service-card|PerformantServiceCard]] — Enhanced version with priority-based polling and web URL links
- [[docs/components/server-status-badge|ServerStatusBadge]] — Status indicator used in this component

## Related Hooks

- `useServiceHealth` — Health data fetching
- `useServiceStats` — Stats data fetching
- `useClearCache` — Cache invalidation

## Code

```tsx
// Key pattern: memo + React Query hooks
export const OptimizedServiceCard = memo(
  ({
    serviceName,
    displayName,
    enableStats = true,
  }: OptimizedServiceCardProps) => {
    const {
      data: health,
      isLoading,
      error,
      refetch,
    } = useServiceHealth(serviceName);
    const { data: stats } = useServiceStats(serviceName, enableStats);
    // ...
  }
);
```
