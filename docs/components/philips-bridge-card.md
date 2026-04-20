---
title: "Component: PhilipsBridgeCard"
type: component
status: superseded
date: 2026-04-02
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [component, frontend, react, service-card, philips, hue, smart-home]
description: Philips Hue Bridge monitoring card with ICMP ping-based connectivity check
aliases: [philips hue card, hue bridge card, smart lighting monitoring]
---

# Component: PhilipsBridgeCard

> [!danger] Superseded — Legacy Phase 6 Components
> These per-service `*Card` components describe **v1 frontend architecture** (Phase 6, individual card components). The frontend was rewritten in Phase 3 with a `ServiceTile` + renderer registry bento dashboard (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] and [[docs/components/bento-dashboard|BentoDashboard]]). Content retained for archival reference only.


> [!abstract] Overview
> Displays Philips Hue Bridge connectivity status using ICMP ping for lightweight health monitoring.

## Purpose

Monitors Philips Hue Bridge availability to ensure smart lighting control is operational. Uses simple ping-based health checks since the bridge has minimal API surface for monitoring.

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

| Metric            | Description                    |
| ----------------- | ------------------------------ |
| Host Reachability | ICMP ping result               |
| Response Time     | Ping latency                   |
| Last Check        | Timestamp of last health check |

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`

## Source

- `apps/frontend/src/components/PhilipsBridgeCard.tsx`

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/philips-hue|Philips Hue Integration]]
