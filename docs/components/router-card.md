---
title: "Component: RouterCard"
type: component
status: superseded
date: 2026-04-02
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [component, frontend, react, service-card, router, network, arp]
description: Network router monitoring card with ARP table lookup for connected device tracking
aliases:
  [router card, network router card, arp lookup, beryl card, telenet card]
---

# Component: RouterCard

> [!danger] Superseded — Legacy Phase 6 Components
> These per-service `*Card` components describe **v1 frontend architecture** (Phase 6, individual card components). The frontend was rewritten in Phase 3 with a `ServiceTile` + renderer registry bento dashboard (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] and [[docs/components/bento-dashboard|BentoDashboard]]). Content retained for archival reference only.


> [!abstract] Overview
> Displays network router (Beryl AX, Telenet) health status and performs ARP table lookups to show connected devices on the local network.

## Purpose

Monitors network routers through ICMP ping and TCP port checks. Unique feature: performs ARP/neighbor table lookups via the backend to display connected devices on the LAN.

## Props

| Prop             | Type     | Required | Default     | Description                                        |
| ---------------- | -------- | -------- | ----------- | -------------------------------------------------- |
| `name`           | `string` | Yes      | —           | Display name (e.g., "Beryl AX", "Telenet")         |
| `serviceKey`     | `string` | Yes      | —           | Backend service key (e.g., `"beryl"`, `"telenet"`) |
| `instanceId`     | `string` | No       | `undefined` | Multi-instance identifier                          |
| `instanceNumber` | `number` | No       | `undefined` | Instance number for display suffix                 |

## Data Fetching

Uses React Query with `useQuery`:

- Fetches aggregate health from `apiClient.getServicesHealth()` every 30s
- Fetches frontend config for host information
- Fetches ARP table from `apiClient.getArpTable()` when enabled

## ARP Lookup

ARP table lookup is enabled when:

1. The service is in `ENABLED_SERVICES`
2. A host address is known (from health data or frontend config)

## Displayed Metrics

| Metric            | Description                            |
| ----------------- | -------------------------------------- |
| Host Reachability | ICMP ping result                       |
| Response Time     | Ping latency                           |
| Connected Devices | ARP table entries (IP, MAC, interface) |
| LAN Device Count  | Number of devices on local network     |

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ui/button.tsx]]` — Refresh button
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/url.ts]]` — URL utilities
- `[[apps/frontend/src/lib/apiResponse.ts]]` — Response unwrapping

## Source

- `apps/frontend/src/components/RouterCard.tsx`

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/router|Router Integration]]
- [[docs/api/index|API Index]] — ARP endpoint
