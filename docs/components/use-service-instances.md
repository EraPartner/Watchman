---
title: "Hook: useServiceInstances"
type: component
status: active
date: 2026-04-02
tags: [hook, frontend, react, multi-instance, query]
description: React Query hook for fetching and querying multi-instance service metadata
aliases: [use service instances, multi-instance hook, instance metadata]
---

# Hook: useServiceInstances

> [!abstract] Overview
> A React Query hook that fetches multi-instance service metadata and provides helper methods for querying instance information by service type.

## Purpose

Enables the frontend to discover and render multiple instances of the same service type (e.g., multiple qBittorrent nodes). Provides convenient accessor methods for instance counts and IDs.

## Exports

### `useServiceInstances()`

```typescript
const {
  getInstances,
  getInstanceCount,
  hasMultipleInstances,
  data,
  isLoading,
} = useServiceInstances();
```

**Query Configuration:**

- Query key: `["services", "instances"]`
- `refetchInterval`: 60 seconds
- `retry`: 1

### Helper Methods

| Method                       | Parameters            | Returns             | Description                                       |
| ---------------------------- | --------------------- | ------------------- | ------------------------------------------------- |
| `getInstances(type)`         | `serviceType: string` | `ServiceInstance[]` | Array of instances for a service type             |
| `getInstanceCount(type)`     | `serviceType: string` | `number`            | Number of instances for a service type            |
| `hasMultipleInstances(type)` | `serviceType: string` | `boolean`           | Whether a service type has more than one instance |

## Types

```typescript
interface ServiceInstance {
  id: string;
  type: string;
}

interface ServiceInstancesData {
  instances: Record<
    string,
    {
      count: number;
      instances: ServiceInstance[];
    }
  >;
  timestamp: string;
}
```

## Usage Example

```tsx
import { useServiceInstances } from "../hooks/useServiceInstances";

function QBittorrentSection() {
  const { getInstances, hasMultipleInstances } = useServiceInstances();
  const instances = getInstances("qbittorrent");
  const isMulti = hasMultipleInstances("qbittorrent");

  return (
    <div>
      {isMulti && <p>Multiple qBittorrent instances detected</p>}
      {instances.map((instance) => (
        <QBittorrentCard key={instance.id} instanceId={instance.id} />
      ))}
    </div>
  );
}
```

## Dependencies

- `@tanstack/react-query` — `useQuery`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`

## Source

- [[apps/frontend/src/hooks/useServiceInstances.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/features/multi-instance|Multi-Instance Support]]
- [[docs/api/services-health|Services Health API]]
