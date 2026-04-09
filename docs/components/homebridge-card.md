---
title: "Component: HomebridgeCard"
type: component
status: active
date: 2026-04-09
tags: [component, frontend, react, service-card, homebridge, smart-home]
description: Homebridge smart home hub monitoring card with server info, version, and accessories
aliases: [homebridge card, smart home card, homekit bridge monitoring]
---

# Component: HomebridgeCard

> [!abstract] Overview
> Displays Homebridge server status including version information, platform details, accessories list, and server uptime.

## Purpose

Monitors Homebridge instances that bridge non-HomeKit smart home devices to Apple HomeKit. Shows server health, installed plugins, and connected accessories.

## Props

| Prop             | Type     | Required | Default        | Description                        |
| ---------------- | -------- | -------- | -------------- | ---------------------------------- |
| `instanceId`     | `string` | No       | `"homebridge"` | Service instance identifier        |
| `instanceNumber` | `number` | No       | `undefined`    | Instance number for display suffix |

## Data Fetching

Uses React Query with `useQuery` for status polling.

- Loading state is based on **initial load** (`isLoading`) only, so background `isFetching` refetches do not trigger loading flicker.

## Displayed Metrics

| Metric    | Description                     |
| --------- | ------------------------------- |
| Version   | Homebridge version              |
| Uptime    | Server uptime duration          |
| Last Seen | Last successful check timestamp |

## Accessories Degradation UX

- If `GET /api/accessories` returns a degraded-success payload, the card shows a yellow inline warning using `warning` or `message` from the API while continuing to render available Homebridge stats.

## Known Issues

> [!warning] Technical Debt
>
> - Contains an empty placeholder `<div>` block with only a comment showing intended content
> - No contract/behavior change in recent cleanup; this component was updated for render-state hygiene only

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/components/UpdateBadge.tsx]]` — Update availability
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`

## Source

- [[apps/frontend/src/components/HomebridgeCard.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/homebridge|Homebridge Integration]]
- [[docs/api/index|API Index]] — Homebridge endpoints
