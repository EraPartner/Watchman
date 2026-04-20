---
title: "Component: SynologyCard"
type: component
status: superseded
date: 2026-04-02
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [component, frontend, react, service-card, synology, nas, snmp]
description: Synology NAS monitoring card displaying system, CPU, memory, disk, and network stats via SNMP
aliases: [synology card, nas card, snmp monitoring]
---

# Component: SynologyCard

> [!danger] Superseded — Legacy Phase 6 Components
> These per-service `*Card` components describe **v1 frontend architecture** (Phase 6, individual card components). The frontend was rewritten in Phase 3 with a `ServiceTile` + renderer registry bento dashboard (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] and [[docs/components/bento-dashboard|BentoDashboard]]). Content retained for archival reference only.


> [!abstract] Overview
> Displays Synology NAS health and statistics collected via SNMPv3, including system info, CPU usage, memory, disk space, and network throughput.

## Purpose

Monitors Synology NAS devices showing comprehensive system health through SNMP queries. Displays hardware metrics that help identify resource bottlenecks and storage capacity issues.

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

| Metric             | Description                      |
| ------------------ | -------------------------------- |
| Model              | Synology model name              |
| Serial Number      | Device serial                    |
| System Temperature | Current temperature              |
| CPU Usage          | Processor utilization percentage |
| Memory Usage       | RAM utilization                  |
| Disk Usage         | Storage capacity used/available  |
| Network I/O        | Upload/download throughput       |
| System Uptime      | Time since last reboot           |
| DSM Version        | DiskStation Manager version      |

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`

## Source

- `apps/frontend/src/components/SynologyCard.tsx`

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/synology|Synology Integration]]
