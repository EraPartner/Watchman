---
title: "Component: LiveServerDashboard"
type: component
status: active
date: 2026-04-02
tags: [component, frontend, react, page, dashboard, layout]
description: Main dashboard component that orchestrates all service cards into a responsive grid layout
aliases: [live server dashboard, dashboard, main dashboard, home page]
---

# Component: LiveServerDashboard

> [!abstract] Overview
> The main dashboard component that fetches service health data, determines enabled services, and renders all service cards in a responsive grid layout with overview statistics.

## Purpose

Serves as the primary view of the Watchman application. Orchestrates data fetching for all enabled services, renders service cards in organized rows, and displays system health overview statistics.

## Data Fetching

Uses React Query to fetch data for each enabled service independently:

| Query Key                   | Data                              | Refetch Interval                      |
| --------------------------- | --------------------------------- | ------------------------------------- |
| `["adguard", "full"]`       | Combined health + stats           | `APP_CONFIG.ADGUARD_REFRESH_INTERVAL` |
| `["tor", "relay"]`          | Tor relay stats + frontend config | `APP_CONFIG.TOR_REFRESH_INTERVAL`     |
| `["bitcoin", "status"]`     | Bitcoin node status               | 30s                                   |
| `["qbittorrent", "status"]` | qBittorrent status                | 30s                                   |
| `["ipfs", "status"]`        | IPFS node status                  | 30s                                   |
| `["synology", "status"]`    | Synology NAS status               | 60s                                   |
| `["roon", "status"]`        | Roon server status                | `APP_CONFIG.ADGUARD_REFRESH_INTERVAL` |
| `["philips", "status"]`     | Philips Hue status                | 60s                                   |
| `["homebridge", "status"]`  | Homebridge status                 | 30s                                   |
| `["albyhub", "status"]`     | Alby Hub status                   | 30s                                   |
| `["macmini", "status"]`     | Mac Mini status                   | 30s                                   |
| `["raspi", "status"]`       | Raspberry Pi status               | 30s                                   |
| `["nostrcheck", "status"]`  | Nostrcheck status                 | 30s                                   |
| `["beryl", "status"]`       | Beryl router status               | 30s                                   |
| `["telenet", "status"]`     | Telenet router status             | 30s                                   |

## Layout Pattern

### Tile Stacking

Related services are vertically stacked within the same grid cell to save horizontal space:

| Stack      | Services              |
| ---------- | --------------------- |
| Network    | IPFS + Homebridge     |
| Smart Home | Nostrcheck + Alby Hub |
| Media      | Roon + Philips Hue    |

### Grid Structure

- Cards are organized into rows using chunking
- Each row uses CSS grid with responsive columns
- Multi-instance services render as separate cards with `#N` suffixes

## Props

This component takes no props. It derives all data from:

- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]` — determines which services to show
- `[[apps/frontend/src/hooks/useServiceInstances|useServiceInstances]]` — multi-instance metadata
- React Query hooks for individual service data

## Dependencies

- `@tanstack/react-query` — `useQuery` for data fetching
- All 14 service card components
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/hooks/useServiceInstances|useServiceInstances]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/constants.ts]]` — `APP_CONFIG`
- shadcn/ui: `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Button`
- `lucide-react` — `Activity`, `CheckCircle`, `RefreshCw`, `Server`, `Shield`

## Known Issues

> [!warning] Technical Debt
>
> - **God Component**: At ~793 lines, this component handles too many responsibilities. Should be split into `DashboardHeader`, `OverviewStats`, `SoftwareSection`, `HardwareSection`, and `ServiceTileRenderer`.
> - **Misleading `lastUpdateTime`**: `new Date()` is set at render time, making `timeSinceUpdate` always show seconds since last render, not actual data freshness.
> - **Multi-instance data sharing**: All instances of the same service type currently share the same data query — instance-specific fetching is incomplete.

## Source

- [[apps/frontend/src/components/LiveServerDashboard.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/features/service-monitoring|Service Monitoring]]
- [[docs/features/multi-instance|Multi-Instance Support]]
