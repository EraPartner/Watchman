---
title: "Component: QBittorrentCard"
type: component
status: active
date: 2026-04-02
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

Uses manual `useEffect` + `setInterval` pattern (not React Query):

- Authenticates with qBittorrent Web API via cookie
- Fetches transfer info, torrent list, and server state
- Polls at configured interval

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

## Known Issues

> [!warning] Technical Debt
>
> - Uses manual `useEffect` + `setInterval` instead of React Query
> - Cookie-based authentication requires session management

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`

## Source

- [[apps/frontend/src/components/QBittorrentCard.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/qbittorrent|qBittorrent Integration]]
- [[docs/features/multi-instance|Multi-Instance Support]]
