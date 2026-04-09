---
title: "Component: QBittorrentCard"
type: component
status: active
date: 2026-04-09
tags: [component, frontend, react, service-card, qbittorrent, torrent]
description: qBittorrent download client card showing transfer stats, active torrents, and connection info
aliases: [qbittorrent card, torrent card, download monitoring]
---

# Component: QBittorrentCard

> [!abstract] Overview
> Displays qBittorrent Web API status including active downloads/uploads, transfer speeds, and connection statistics.

## Purpose

Monitors qBittorrent instances showing current transfer activity, download/upload speeds, total transferred data, and server connectivity. Supports multi-instance deployments.

## Props

| Prop             | Type     | Required | Default         | Description                        |
| ---------------- | -------- | -------- | --------------- | ---------------------------------- |
| `instanceId`     | `string` | No       | `"qbittorrent"` | Service instance identifier        |
| `instanceNumber` | `number` | No       | `undefined`     | Instance number for display suffix |

## Data Fetching

Uses React Query for both status and stats:

- Health query key: `queryKeys.serviceStatus("qbittorrent", instanceId)`
- Stats query key: `queryKeys.serviceStats("qbittorrent", instanceId)`
- Polling interval: 30s for both queries
- Stats query is enabled only when service health resolves to online/warning

## Displayed Metrics

| Metric              | Description                        |
| ------------------- | ---------------------------------- |
| Download Speed      | Current download rate              |
| Upload Speed        | Current upload rate                |
| Active Torrents     | Number of active downloads/uploads |
| Total Downloaded    | Cumulative download volume         |
| Total Uploaded      | Cumulative upload volume           |
| Ratio               | Share ratio                        |
| Free Disk Space     | Available storage                  |
| qBittorrent Version | Client version                     |

## Notes

- Behavior remains functionally equivalent after refactor; data-fetching mechanics moved to React Query.
- qBittorrent backend authentication/session behavior remains unchanged.

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices.ts|useEnabledServices]]`
- `[[apps/frontend/src/hooks/useFrontendConfig.ts|useFrontendConfig]]`
- `[[apps/frontend/src/lib/queryKeys.ts]]`
- `[[apps/frontend/src/services/ApiClient.ts|apiClient]]`

## Source

- [[apps/frontend/src/components/QBittorrentCard.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/qbittorrent|qBittorrent Integration]]
- [[docs/features/multi-instance|Multi-Instance Support]]
