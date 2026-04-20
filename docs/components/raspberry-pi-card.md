---
title: "Component: RaspberryPiCard"
type: component
status: superseded
date: 2026-04-03
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [component, frontend, react, service-card, raspberry-pi, gpio, ssh]
description: Raspberry Pi monitoring card with GPIO status, hardware info, and system metrics
aliases: [raspberry pi card, rpi card, pi monitoring, gpio card]
---

# Component: RaspberryPiCard

> [!danger] Superseded — Legacy Phase 6 Components
> These per-service `*Card` components describe **v1 frontend architecture** (Phase 6, individual card components). The frontend was rewritten in Phase 3 with a `ServiceTile` + renderer registry bento dashboard (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] and [[docs/components/bento-dashboard|BentoDashboard]]). Content retained for archival reference only.


> [!abstract] Overview
> Displays Raspberry Pi health and statistics including hardware model, GPIO pin states, system resources, and connectivity.

## Purpose

Monitors Raspberry Pi devices used as IoT controllers and edge computing nodes. Collects metrics via pigpio-client protocol over TCP and SSH commands.

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

| Metric            | Description                            |
| ----------------- | -------------------------------------- |
| Pi Model          | Hardware model (decoded from revision) |
| CPU Temperature   | SoC temperature                        |
| CPU Usage         | Processor utilization                  |
| Memory Usage      | RAM utilization                        |
| Disk Usage        | SD card storage used/available         |
| Uptime            | System uptime                          |
| GPIO States       | Pin read/write states                  |
| Host Reachability | ICMP ping result                       |

## Known Issues

> [!warning] Technical Debt
>
> - Contains debug `console.log` statements with emoji prefixes in production code
> - Contains a duplicated `formatUptime` function (also exists in `utils.ts`)
> - Previously used `"not_configured"` status not in `ServerStatusBadge` type union (now normalized to `"offline"` in `[[apps/frontend/src/components/RaspberryPiCard.tsx]]`)

## Runtime Safety

- Load average display now guards numeric values before calling `toFixed()`, preventing runtime errors when backend data is missing or non-numeric in `[[apps/frontend/src/components/RaspberryPiCard.tsx]]`
- Badge status mapping now normalizes `not_configured` to `offline` for `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` compatibility

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/utils.ts]]` — `formatUptime` (local duplicate)

## Source

- `apps/frontend/src/components/RaspberryPiCard.tsx`

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/raspberry-pi|Raspberry Pi Integration]]
