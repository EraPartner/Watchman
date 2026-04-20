---
title: "Component: NostrcheckCard"
type: component
status: superseded
date: 2026-04-02
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [component, frontend, react, service-card, nostr, relay]
description: Nostr relay monitoring card with relay URL and web interface links
aliases: [nostrcheck card, nostr relay card, nostr monitoring]
---

# Component: NostrcheckCard

> [!danger] Superseded — Legacy Phase 6 Components
> These per-service `*Card` components describe **v1 frontend architecture** (Phase 6, individual card components). The frontend was rewritten in Phase 3 with a `ServiceTile` + renderer registry bento dashboard (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] and [[docs/components/bento-dashboard|BentoDashboard]]). Content retained for archival reference only.


> [!abstract] Overview
> Displays Nostr relay status with clickable links to the relay endpoint and web interface.

## Purpose

Monitors Nostr relay/relay-checker services showing connectivity status and providing quick access to both the relay endpoint (ws:// URL) and the web management interface.

## Props

| Prop             | Type                                                         | Required | Default        | Description                        |
| ---------------- | ------------------------------------------------------------ | -------- | -------------- | ---------------------------------- |
| `name`           | `string`                                                     | No       | `"Nostrcheck"` | Display name                       |
| `status`         | `"online" \| "offline" \| "warning" \| "loading" \| "error"` | No       | `"offline"`    | Current status                     |
| `url`            | `string`                                                     | No       | `undefined`    | Fallback relay URL                 |
| `fullHeight`     | `boolean`                                                    | No       | `false`        | Whether to fill container height   |
| `instanceId`     | `string`                                                     | No       | `undefined`    | Multi-instance identifier          |
| `instanceNumber` | `number`                                                     | No       | `undefined`    | Instance number for display suffix |

## Behavior

- Uses `[[docs/components/use-config-hook|useConfig]]` for relay and web URLs from backend config
- Displays relay URL using `[[docs/components/service-link|ServiceLink]]` component
- Shows web UI URL when `NOSTRCHECK_WEB_URL` is configured
- Provides "Open Relay" and "Open Web UI" buttons
- Shows `AlertTriangle` warning when not online

## Displayed Metrics

| Metric     | Description              |
| ---------- | ------------------------ |
| Relay URL  | WebSocket relay endpoint |
| Web UI URL | Web management interface |
| Status     | Connectivity status      |

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ui/button.tsx]]` — Action buttons
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[docs/components/service-link|ServiceLink]]` — URL display
- `[[docs/components/use-config-hook|useConfig]]` — URL configuration

## Source

- `apps/frontend/src/components/NostrcheckCard.tsx`

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/nostrcheck|Nostrcheck Integration]]
