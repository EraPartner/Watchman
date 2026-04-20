---
title: "Component: BitcoinCard"
type: component
status: superseded
date: 2026-04-02
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [component, frontend, react, service-card, bitcoin, cryptocurrency]
description: Bitcoin node monitoring card displaying blockchain stats, network info, and mempool data
aliases: [bitcoin card, bitcoin node card, btc monitoring]
---

# Component: BitcoinCard

> [!danger] Superseded — Legacy Phase 6 Components
> These per-service `*Card` components describe **v1 frontend architecture** (Phase 6, individual card components). The frontend was rewritten in Phase 3 with a `ServiceTile` + renderer registry bento dashboard (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] and [[docs/components/bento-dashboard|BentoDashboard]]). Content retained for archival reference only.


> [!abstract] Overview
> Displays Bitcoin Core node status including blockchain height, network connections, mempool statistics, and synchronization progress.

## Purpose

Monitors Bitcoin Core nodes showing block height, network peers, mempool size, verification progress, and chain information. Supports multi-instance deployments.

## Props

| Prop             | Type     | Required | Default     | Description                        |
| ---------------- | -------- | -------- | ----------- | ---------------------------------- |
| `instanceId`     | `string` | No       | `"bitcoin"` | Service instance identifier        |
| `instanceNumber` | `number` | No       | `undefined` | Instance number for display suffix |

## Data Fetching

Uses manual `useEffect` + `setInterval` pattern (not React Query):

- Fetches health from `apiClient.getServiceHealth(instanceId)` every 15s
- Fetches stats from `apiClient.getServiceStats(instanceId)` when online
- Maps `not_configured` status to `offline`

## Displayed Metrics

| Metric                | Description                           |
| --------------------- | ------------------------------------- |
| Block Height          | Current blockchain height             |
| Network Connections   | Number of connected peers             |
| Mempool Size          | Pending transactions count/size       |
| Verification Progress | Sync progress percentage              |
| Chain                 | Network name (mainnet, testnet, etc.) |
| Version               | Bitcoin Core version                  |
| Uptime                | Node uptime duration                  |

## Known Issues

> [!warning] Technical Debt
>
> - Uses manual `useEffect` + `setInterval` instead of React Query (inconsistent with other cards)
> - Contains debug `console.log` statements in production code
> - 2-minute timeout warning but 15-second polling interval can create thundering herd of requests
> - Casts API responses to `any` instead of typed interfaces

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/components/UpdateBadge.tsx]]` — Update availability
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/utils.ts]]` — `formatNumber`, `formatBytes`, `formatUptime`

## Source

- `apps/frontend/src/components/BitcoinCard.tsx`

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/bitcoin|Bitcoin Integration]]
- [[docs/features/multi-instance|Multi-Instance Support]]
