---
title: useBackendReachable Hook
type: component
status: active
date: 2026-04-20
tags: [hook, frontend, split-deploy, reachability, health-check, polling]
description: React hook that monitors Raspberry Pi backend reachability via periodic polling of /meta/health endpoint
aliases: [backend reachable hook, reachability hook]
---

# useBackendReachable Hook

> [!abstract] Overview
> The `useBackendReachable` hook monitors the health of a remote Fastify backend (typically on a Raspberry Pi in split-deploy mode) by polling the `/meta/health` endpoint at regular intervals. It detects when the backend becomes unreachable and provides methods to manually retry or reconfigure the URL.

## Usage

```typescript
import { useBackendReachable } from '../hooks/useBackendReachable'

function MyComponent() {
  const { reachable, apiUrl, probing, probe } = useBackendReachable()

  if (!reachable && apiUrl) {
    return <p>Backend at {apiUrl} is offline</p>
  }

  return <p>Backend is online</p>
}
```

## Interface

```typescript
export interface BackendReachableState {
  reachable: boolean
  apiUrl: string
  probing: boolean
  probe: () => Promise<void>
}

export function useBackendReachable(): BackendReachableState
```

## Properties

| Property   | Type     | Description                                                                 |
| ---------- | -------- | --------------------------------------------------------------------------- |
| `reachable` | boolean | `true` if backend is responding; `false` after 3 consecutive failed probes  |
| `apiUrl`   | string   | Current backend URL from `getBackendUrl()`; empty string if not configured  |
| `probing`  | boolean  | `true` if a probe is currently in flight (for UI feedback)                  |
| `probe`    | function | Manual trigger to probe immediately (useful for Retry buttons)              |

## Polling Behavior

- **Interval**: 10 seconds between probes (when `apiUrl` is set)
- **Timeout**: 3 seconds per probe (AbortSignal.timeout)
- **Failure threshold**: 3 consecutive failures before flipping `reachable` to `false`
- **Recovery**: One successful probe resets the failure counter and sets `reachable` to `true`
- **No apiUrl**: If `apiUrl` is empty, returns `reachable: true` immediately (avoids offline banner in dev/bundled mode)

## Internals

```typescript
async function probeHealth(base: string): Promise<boolean> {
  if (!base) return false
  try {
    const response = await fetch(`${base}/meta/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    return response.ok
  } catch {
    return false
  }
}
```

- Probe sends `GET {apiUrl}/meta/health` with a 3-second timeout
- Returns `true` only if the response status is 2xx
- Network errors (ECONNREFUSED, ETIMEDOUT, etc.) return `false`
- Timeout errors are caught and handled gracefully

## Cleanup

The hook cleans up on unmount:
- Clears the polling interval
- Sets a `cancelledRef` flag to prevent state updates after unmount
- No memory leaks or dangling timers

## Integration with OfflineBanner

The `OfflineBanner` component uses this hook:

```typescript
function OfflineBanner() {
  const { reachable, apiUrl, probe } = useBackendReachable()

  if (!apiUrl || reachable) return null

  return (
    <div className="offline-banner">
      <p>Cannot reach backend at {apiUrl}</p>
      <button onClick={() => void probe()}>Retry</button>
      <button onClick={() => changeUrl()}>Change URL</button>
    </div>
  )
}
```

See [[docs/components/offline-banner|OfflineBanner Component]] for full implementation.

## File Location

`[[apps/frontend/src/hooks/useBackendReachable.ts]]`

## Related

- [[docs/components/offline-banner|OfflineBanner Component]] — Uses this hook to show offline state
- [[apps/frontend/src/lib/backendUrl.ts|Backend URL Resolution]] — Provides `getBackendUrl()` used by this hook
- [[docs/adr/018-split-deploy-pi-backend|ADR-018]] — Split Deploy architecture context
- [[docs/components/index|Components Index]]
