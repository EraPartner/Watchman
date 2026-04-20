---
title: "Component: AlbyHubCard"
type: component
status: superseded
date: 2026-04-09
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [component, frontend, react, service-card, alby, lightning, bitcoin]
description: Alby Hub Lightning wallet monitoring card with app list and node info
aliases: [alby hub card, lightning wallet card, alby monitoring]
---

# Component: AlbyHubCard

> [!danger] Superseded — Legacy Phase 6 Components
> These per-service `*Card` components describe **v1 frontend architecture** (Phase 6, individual card components). The frontend was rewritten in Phase 3 with a `ServiceTile` + renderer registry bento dashboard (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] and [[docs/components/bento-dashboard|BentoDashboard]]). Content retained for archival reference only.


> [!abstract] Overview
> Displays Alby Hub Lightning Network wallet status including node information, connected apps, and wallet balance.

## Purpose

Monitors Alby Hub instances that manage Lightning Network applications and wallets. Shows node connectivity, app integrations, and wallet health.

## Props

| Prop             | Type     | Required | Default     | Description                        |
| ---------------- | -------- | -------- | ----------- | ---------------------------------- |
| `instanceId`     | `string` | No       | `"albyhub"` | Service instance identifier        |
| `instanceNumber` | `number` | No       | `undefined` | Instance number for display suffix |

## Data Fetching

Uses manual `useEffect` + `setInterval` pattern (not React Query).

## Typing Notes

- `[[apps/frontend/src/components/AlbyHubCard.tsx]]` now reads frontend service config via typed `FrontendConfig` access instead of loose `as any` usage.
- This is an internal typing cleanup/refactor and does not change card behavior.

## Displayed Metrics

| Metric           | Description                         |
| ---------------- | ----------------------------------- |
| Node Alias       | Lightning node display name         |
| Node ID          | Public key identifier               |
| Connected Apps   | Number of authorized applications   |
| Wallet Balance   | Current sats balance                |
| Network          | Lightning network (mainnet/testnet) |
| Alby Hub Version | Hub software version                |

## Known Issues

> [!warning] Technical Debt
>
> - Uses manual `useEffect` + `setInterval` instead of React Query

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`

## Source

- `apps/frontend/src/components/AlbyHubCard.tsx`

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/albyhub|Alby Hub Integration]]
