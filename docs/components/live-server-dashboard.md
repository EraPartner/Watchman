---
title: "Component: LiveServerDashboard"
type: component
status: active
date: 2026-04-11
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

Uses `[[apps/frontend/src/components/dashboard/useDashboardQueries.ts]]` to centralize dashboard query definitions, query keys, and refresh behavior for enabled services. Query keys remain centralized in `[[apps/frontend/src/lib/queryKeys.ts]]`:

- `refreshEnabledQueries()` also refetches `queryKeys.servicesHealth()` so overview counters update during manual dashboard refresh.
- Refresh-scope behavior is covered in [[apps/frontend/src/components/dashboard/useDashboardQueries.test.ts]]: enabled-service queries are refetched selectively, and `servicesHealth` is always refetched.

| Query Key                                | Data                              | Refetch Interval                      |
| ---------------------------------------- | --------------------------------- | ------------------------------------- |
| `queryKeys.adguardFull()`                | Combined health + stats           | `APP_CONFIG.ADGUARD_REFRESH_INTERVAL` |
| `queryKeys.torRelay()`                   | Tor relay payload                 | `APP_CONFIG.TOR_REFRESH_INTERVAL`     |
| `queryKeys.frontendConfig()`             | Frontend config payload           | On demand (`staleTime: Infinity`)     |
| `queryKeys.serviceStatus("bitcoin")`     | Bitcoin node status               | 30s                                   |
| `queryKeys.serviceStatus("qbittorrent")` | qBittorrent status                | 30s                                   |
| `queryKeys.serviceStatus("ipfs")`        | IPFS node status                  | 30s                                   |
| `queryKeys.serviceStatus("synology")`    | Synology NAS status               | 60s                                   |
| `queryKeys.serviceStatus("roon")`        | Roon server status                | `APP_CONFIG.ADGUARD_REFRESH_INTERVAL` |
| `queryKeys.servicesHealth()`             | Aggregate enabled-services health | 30s                                   |

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
- Instance tiles are assembled through shared helpers in `[[apps/frontend/src/components/dashboard/dashboardData.ts]]` (`appendInstanceTiles`, `getInstanceNumber`) to keep multi-instance rendering logic reusable
- Repeated Software/Hardware section-row rendering is delegated to `[[apps/frontend/src/components/dashboard/DashboardTileSection.tsx]]` for maintainability.

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
- `[[apps/frontend/src/lib/queryKeys.ts]]`
- `[[apps/frontend/src/components/dashboard/useDashboardQueries.ts]]`
- `[[apps/frontend/src/components/dashboard/useDashboardQueries.test.ts]]`
- `[[apps/frontend/src/components/dashboard/dashboardData.test.ts]]`
- `[[apps/frontend/src/components/dashboard/dashboardStatus.test.ts]]`
- `[[apps/frontend/src/components/dashboard/DashboardTileSection.tsx]]`
- `[[apps/frontend/src/components/dashboard/dashboardStatus.ts]]`
- `[[apps/frontend/src/components/dashboard/dashboardData.ts]]`
- `[[apps/frontend/src/components/dashboard/dashboardData.ts]]` instance helpers: `appendInstanceTiles`, `getInstanceNumber`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`
- `[[apps/frontend/src/lib/constants.ts]]` — `APP_CONFIG`
- shadcn/ui: `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Button`
- `lucide-react` — `Activity`, `CheckCircle`, `RefreshCw`, `Server`, `Shield`

## Known Issues

> [!warning] Technical Debt
>
> - **Large orchestrator component**: Still coordinates many concerns, though status/data logic and query orchestration were extracted into helper modules under `components/dashboard/`.
> - **Misleading `lastUpdateTime`**: `new Date()` is set at render time, making `timeSinceUpdate` always show seconds since last render, not actual data freshness.
> - **Multi-instance data sharing**: All instances of the same service type currently share the same data query — instance-specific fetching is incomplete.

## Source

- [[apps/frontend/src/components/LiveServerDashboard.tsx]]

## Test Coverage Notes

- [[apps/frontend/src/components/LiveServerDashboard.test.tsx]] validates dashboard-level behavior in [[apps/frontend/src/components/LiveServerDashboard.tsx]]:
  - loading-state rendering while dashboard data is still resolving
  - overview counter derivation for mixed online/offline/warning service payloads
  - refresh pending-state rendering/UX behavior during manual refresh cycles
  - stacked Network tile rendering path for IPFS + Homebridge composition
  - system health label matrix coverage for online/warning/offline combinations
- [[apps/frontend/src/components/dashboard/dashboardData.test.ts]] covers helper logic used by dashboard tile composition in [[apps/frontend/src/components/dashboard/dashboardData.ts]] (stats normalization, chunking, and instance-tile assembly branches).
- [[apps/frontend/src/components/dashboard/dashboardStatus.test.ts]] covers aggregate status mapping/counting used by dashboard overview counters in [[apps/frontend/src/components/dashboard/dashboardStatus.ts]].

## Related

- [[docs/components/index|Components Index]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/features/service-monitoring|Service Monitoring]]
- [[docs/features/multi-instance|Multi-Instance Support]]
