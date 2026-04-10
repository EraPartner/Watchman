---
title: useWebSocket Hook
type: component
status: active
date: 2026-04-10
tags: [hook, frontend, react, websocket, real-time, singleton]
description: Global singleton WebSocket hook with automatic reconnection, exponential backoff, connection throttling, and batched targeted React Query invalidation
aliases: [websocket hook, real-time hook, ws hook]
---

# useWebSocket

> [!abstract] Summary
> A React hook that manages a global singleton WebSocket connection with automatic reconnection using exponential backoff, connection throttling, and debounced React Query cache invalidation for real-time service updates.

## Overview

`useWebSocket` is the central real-time communication hook for Watchman. It maintains a single global WebSocket instance across all React components, handles connection lifecycle, and translates WebSocket messages into React Query cache invalidations.

## File Location

`[[apps/frontend/src/hooks/useWebSocket.ts]]`

## Global State

The hook uses module-level globals to maintain a single connection:

| Global Variable         | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `globalWebSocket`       | The single WebSocket instance             |
| `globalConnectionState` | Shared connection state object            |
| `stateSubscribers`      | Set of callbacks notified on state change |
| `globalReconnectFn`     | Reference to reconnect function           |

## Connection Parameters

| Constant                   | Value    | Description                                    |
| -------------------------- | -------- | ---------------------------------------------- |
| `CONNECTION_THROTTLE_MS`   | 5,000ms  | Minimum time between connection attempts       |
| `MAX_RECONNECT_ATTEMPTS`   | 5        | Maximum reconnection attempts before giving up |
| `INITIAL_RECONNECT_DELAY`  | 1,000ms  | Initial delay before first reconnect           |
| `MAX_RECONNECT_DELAY`      | 30,000ms | Maximum delay between reconnect attempts       |
| `INVALIDATION_DEBOUNCE_MS` | 150ms    | Debounce time for batched cache invalidations  |

## Reconnection Strategy

Exponential backoff with cap:

```
delay = min(INITIAL_RECONNECT_DELAY * 2^attempt, MAX_RECONNECT_DELAY)
```

| Attempt | Delay     |
| ------- | --------- |
| 1       | 1s        |
| 2       | 2s        |
| 3       | 4s        |
| 4       | 8s        |
| 5       | 16s       |
| 6+      | 30s (cap) |

## Message Types

| Type             | Behavior                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| `connection`     | Shows success toast                                                              |
| `service_update` | Schedules batched invalidation for `serviceStatus` and `serviceStats` query keys |
| `alert`          | Shows toast notification (error/warning/info)                                    |
| `metrics`        | Schedules invalidation for `[[apps/frontend/src/lib/queryKeys.ts]]` metrics key  |

Note: service update and metrics payloads are handled without per-message console logging; operational diagnostics are emitted via `logger` where needed. This logging cleanup does not change WebSocket message handling or invalidation behavior.

## Cache Invalidation

The hook implements **batched, debounced** cache invalidation using the centralized query key factory `[[apps/frontend/src/lib/queryKeys.ts]]`:

1. WebSocket messages add service keys to a `Set` (deduplicates automatically)
2. A 150ms debounce timer starts on the first message
3. When the timer fires, pending keys are invalidated at once using targeted query keys
4. Query-key families are deduplicated before invalidation (flush-time `Map`-based dedup)
5. New messages during the timer are collected for the next batch

This prevents cache thrashing when multiple service updates arrive rapidly.

Dashboard freshness display (`Updated Xs ago`) now relies on React Query `dataUpdatedAt` values in [[apps/frontend/src/components/LiveServerDashboard.tsx]], so targeted invalidation accuracy directly impacts that timestamp.

### Invalidation Rules

- For `service_update`, the hook invalidates targeted keys:
  - `queryKeys.serviceStatus(baseServiceKey, serviceKey)`
  - `queryKeys.serviceStats(baseServiceKey, serviceKey)`
- For AdGuard updates, it also invalidates `queryKeys.adguardFull()`.
- For Tor updates, it also invalidates `queryKeys.torRelay()`.
- For router services (`beryl`, `telenet`), it also invalidates `queryKeys.routerArp(baseServiceKey)`.
- For `metrics`, it invalidates `queryKeys.metrics()`.
- After any non-metrics service invalidation batch, it invalidates `queryKeys.servicesHealth()` so dashboard aggregate health stays aligned.

In practice, flush-time deduplication currently covers these query-key families: `serviceStatus`, `serviceStats`, `adguardFull`, `torRelay`, `routerArp`, `metrics`, and `servicesHealth`.

Flush-time diagnostics use frontend logger methods (`logger.warn` for invalidation failures and `logger.debug` for batch summaries).

## Return Value

```typescript
{
  isConnected: boolean;       // Current connection state
  reconnectAttempts: number;  // Number of reconnection attempts
  sendMessage: (message: any) => void;  // Send message to server
  disconnect: () => void;     // Manual disconnect
  connect: () => void;        // Manual connect
}
```

## Usage

```tsx
import { useWebSocket } from "@/hooks/useWebSocket";

function Dashboard() {
  const { isConnected, reconnectAttempts } = useWebSocket();

  return (
    <div>
      {isConnected ? "Connected" : `Reconnecting (${reconnectAttempts})`}
    </div>
  );
}
```

## Design Decisions

- **Global singleton** — Prevents multiple WebSocket connections across React component re-renders and multiple hook usages
- **Subscriber pattern** — Components subscribe to global state changes rather than each managing their own connection
- **Debounced + targeted invalidation** — Prevents React Query thrashing while keeping base and instance service keys in sync
- **Connection throttling** — Prevents rapid-fire connection attempts that could overwhelm the server
- **Clean close detection** — Only reconnects if the close wasn't intentional (code !== 1000)
- **Derived WebSocket URL** — Uses `getWebSocketUrl()` to choose `ws`/`wss` based on environment and backend URL settings (`[[apps/frontend/src/lib/backendUrl.ts]]`)

## Related

- [[docs/features/real-time-updates|Real-Time Updates]]
- [[docs/adr/005-real-time-websocket|ADR-005: Real-Time Communication via WebSocket]]
- `[[apps/backend/services/WebSocketManager.js]]` — Backend WebSocket manager
- `[[apps/frontend/src/services/ApiClient.ts]]` — API client (complementary communication)
- `[[apps/frontend/src/lib/logger.ts]]` — Frontend structured logging utility
