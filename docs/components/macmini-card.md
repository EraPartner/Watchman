---
title: "Component: MacMiniCard"
type: component
status: superseded
date: 2026-04-09
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [component, frontend, react, service-card, mac, ssh, server]
description: Mac Mini server monitoring card with SSH-based stats including uptime, CPU temp, and disk
aliases: [mac mini card, mac server card, ssh monitoring]
---

# Component: MacMiniCard

> [!danger] Superseded — Legacy Phase 6 Components
> These per-service `*Card` components describe **v1 frontend architecture** (Phase 6, individual card components). The frontend was rewritten in Phase 3 with a `ServiceTile` + renderer registry bento dashboard (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] and [[docs/components/bento-dashboard|BentoDashboard]]). Content retained for archival reference only.


> [!abstract] Overview
> Displays Mac Mini server health and statistics collected via SSH, including system uptime, CPU temperature, and disk usage.

## Purpose

Monitors Mac Mini servers used as infrastructure hosts. Collects detailed system metrics through SSH commands (using the `ssh2` library with key/passphrase/agent authentication).

## Props

| Prop             | Type           | Required | Default     | Description                           |
| ---------------- | -------------- | -------- | ----------- | ------------------------------------- |
| `name`           | `string`       | Yes      | —           | Service display name                  |
| `status`         | `ServerStatus` | Yes      | —           | Current online/offline/warning status |
| `instanceId`     | `string`       | No       | `undefined` | Multi-instance identifier             |
| `instanceNumber` | `number`       | No       | `undefined` | Instance number for display suffix    |

## Data Fetching

Uses React Query with `useQuery` for status polling.

## Displayed Metrics

| Metric            | Description                                |
| ----------------- | ------------------------------------------ |
| Uptime            | System uptime duration                     |
| CPU Temperature   | Processor temperature (via `osx-cpu-temp`) |
| Disk Usage        | Storage capacity used/available            |
| Memory Usage      | RAM utilization                            |
| Host Reachability | ICMP ping result                           |
| Response Time     | Ping latency                               |

## Known Issues

> [!warning] Technical Debt
>
> - No contract/behavior change in the latest cleanup; dead `statusColor` computation was removed.

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/utils.ts]]` — `formatUptime` (local duplicate)

## Source

- `apps/frontend/src/components/MacMiniCard.tsx`

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/macmini|Mac Mini Integration]]
