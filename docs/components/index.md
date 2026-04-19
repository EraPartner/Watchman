---
title: Frontend Components
type: index
status: active
date: 2026-04-19
tags: [component, index, frontend, ui, primitives, design-system, bento, phase3, settings, backup]
description: Index of all React component and hook documentation for the Watchman frontend including design system primitives and Phase 3 bento dashboard
aliases: [components index, react components, ui components, bento components, settings pages]
---

# Frontend Components

> [!abstract] Overview
> Watchman's frontend is built with React 18, TypeScript, Tailwind CSS, and custom primitives from the dark-luxury design system. **Phase 2** (LIVE) introduces 14 foundation primitives built on OKLCH tokens and Geist typography. **Phase 3** (LIVE — pilot) ships the bento dashboard with a generic `ServiceTile` and renderer registry, collapsing 18 service-specific card components into one. Fully shipped and passing 150+ tests.

## Bento Dashboard Components (Phase 3 — Renderer-Driven Layout)

Phase 3 introduces a new dashboard architecture built on a renderer registry pattern:

- [[docs/components/bento-dashboard|BentoDashboard]] — Main page orchestrator (lazy-loaded, behind `?bento=1` flag)
- [[docs/components/dashboard-grid|DashboardGrid]] — 12-column CSS grid layout container
- [[docs/components/service-tile|ServiceTile]] — Generic single-tile component (replaces all 18 legacy `*Card.tsx`)
- [[docs/components/service-detail-sheet|ServiceDetailSheet]] — Right-anchored detail view for each service
- [[docs/services/renderers/index|ServiceRenderer Registry]] — Per-service customization (summary metrics, detail groups, charts, tone)

**Phase 3 Pilot Services**: Bitcoin (XL tile) and Synology (L tile) have full renderers. Remaining 14 services are stubbed for Phase 4.

> [!note] Legacy Cards
> The 18 service-specific card components (`BitcoinCard`, `SynologyCard`, etc.) remain active and used by `LiveServerDashboard` until Phase 6. The bento dashboard is available as an opt-in feature via `?bento=1`.

## Primitive Components (Phase 2 — Design System — LIVE)

The foundation layer is a set of 14 typed, accessible primitives built on OKLCH color tokens, Geist Variable + Geist Mono typography, and motion foundations. All primitives are <150 LOC each and use Radix Primitives for accessibility underneath.

See [[docs/components/primitives/index|Primitive Components Index]] for complete documentation.

**Core Primitives:**
- **Interactive**: [[docs/components/primitives/button|Button]], [[docs/components/primitives/toggle|Toggle]]
- **Containers**: [[docs/components/primitives/surface|Surface]], [[docs/components/primitives/skeleton|Skeleton]]
- **Modal**: [[docs/components/primitives/dialog|Dialog]], [[docs/components/primitives/sheet|Sheet]]
- **Floating**: [[docs/components/primitives/tooltip|Tooltip]], [[docs/components/primitives/popover|Popover]]
- **Navigation**: [[docs/components/primitives/tabs|Tabs]], [[docs/components/primitives/scroll-area|ScrollArea]]
- **Indicators**: [[docs/components/primitives/badge|Badge]], [[docs/components/primitives/status-dot|StatusDot]]
- **Data Display**: [[docs/components/primitives/metric-value|MetricValue]], [[docs/components/primitives/delta|Delta]], [[docs/components/primitives/sparkline|Sparkline]]

**Note**: The 50-file shadcn/ui layer has been fully removed in favor of owning the primitives directly.

## Component Documentation

```dataview
TABLE WITHOUT ID file.link AS "Component", date AS "Date", status AS "Status"
FROM "docs/components"
WHERE type = "component" AND file.path != "docs/components/primitives"
SORT file.name ASC
```

## Service Cards (Legacy — Phase 6 pending)

The 18 service-specific card components below are **legacy** and remain active for the `LiveServerDashboard` until Phase 6. The bento dashboard (Phase 3, LIVE) replaces them with a single `<ServiceTile>` component driven by a `ServiceRenderer` registry.

| Component                                                  | Service      | File                                                   | Status          |
| ---------------------------------------------------------- | ------------ | ------------------------------------------------------ | --------------- |
| [[docs/components/adguard-card\|AdGuardCard]]              | AdGuard Home | [[apps/frontend/src/components/AdGuardCard.tsx]]       | Legacy (Phase 6) |
| [[docs/components/bitcoin-card\|BitcoinCard]]              | Bitcoin      | [[apps/frontend/src/components/BitcoinCard.tsx]]       | Has Renderer    |
| [[docs/components/tor-card\|TorCard]]                      | Tor          | [[apps/frontend/src/components/TorCard.tsx]]           | Legacy (Phase 6) |
| [[docs/components/qbittorrent-card\|QBittorrentCard]]      | qBittorrent  | [[apps/frontend/src/components/QBittorrentCard.tsx]]   | Legacy (Phase 6) |
| [[docs/components/ipfs-card\|IpfsCard]]                    | IPFS         | [[apps/frontend/src/components/IpfsCard.tsx]]          | Legacy (Phase 6) |
| [[docs/components/synology-card\|SynologyCard]]            | Synology     | [[apps/frontend/src/components/SynologyCard.tsx]]      | Has Renderer    |
| [[docs/components/roon-card\|RoonCard]]                    | Roon         | [[apps/frontend/src/components/RoonCard.tsx]]          | Legacy (Phase 6) |
| [[docs/components/philips-bridge-card\|PhilipsBridgeCard]] | Philips Hue  | [[apps/frontend/src/components/PhilipsBridgeCard.tsx]] | Legacy (Phase 6) |
| [[docs/components/homebridge-card\|HomebridgeCard]]        | Homebridge   | [[apps/frontend/src/components/HomebridgeCard.tsx]]    | Legacy (Phase 6) |
| [[docs/components/macmini-card\|MacMiniCard]]              | Mac Mini     | [[apps/frontend/src/components/MacMiniCard.tsx]]       | Legacy (Phase 6) |
| [[docs/components/albyhub-card\|AlbyHubCard]]              | Alby Hub     | [[apps/frontend/src/components/AlbyHubCard.tsx]]       | Legacy (Phase 6) |
| [[docs/components/raspberry-pi-card\|RaspberryPiCard]]     | Raspberry Pi | [[apps/frontend/src/components/RaspberryPiCard.tsx]]   | Legacy (Phase 6) |
| [[docs/components/router-card\|RouterCard]]                | Router       | [[apps/frontend/src/components/RouterCard.tsx]]        | Legacy (Phase 6) |
| [[docs/components/nostrcheck-card\|NostrcheckCard]]        | Nostrcheck   | [[apps/frontend/src/components/NostrcheckCard.tsx]]    | Legacy (Phase 6) |

## Shared Components (Legacy)

| Component                                                      | Description                 | File                                                     | Status           |
| -------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- | ---------------- |
| [[docs/components/error-boundary\|ErrorBoundary]]              | Error boundary wrapper      | [[apps/frontend/src/components/ErrorBoundary.tsx]]       | Active           |
| [[docs/components/auth-guard\|AuthGuard]]                      | Route protection wrapper    | [[apps/frontend/src/components/AuthGuard.tsx]]           | Active           |
| [[docs/components/live-server-dashboard\|LiveServerDashboard]] | Legacy dashboard (Phase 6)  | [[apps/frontend/src/components/LiveServerDashboard.tsx]] | **Deprecated**   |

### Deleted Components (Phase 3)

The following components were removed during the bento redesign:

- **UpdateBadge** — Removed
- **ServerStatusBadge** — Replaced by primitives (Badge, StatusDot)
- **ServiceLink** — Removed

### Test Coverage

- [[apps/frontend/src/components/ErrorBoundary.test.tsx]] covers error handling and fallback UI
- [[apps/frontend/src/components/AuthGuard.test.tsx]] covers protected route behavior

## Custom Hooks

### Data & Service Hooks

| Hook                                                                                              | Description                                           | File                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| [[docs/components/use-service-health\|useServiceHealth / useServiceStats]]                       | Query service health/stats snapshots                  | [[apps/frontend/src/hooks/useServiceHealth.ts]]     |
| [[docs/components/use-service-history\|useServiceHistory]]                                       | Query time-series historical metrics (Phase 1)        | [[apps/frontend/src/hooks/useServiceHistory.ts]]    |
| [[docs/components/use-fleet-summary\|useFleetSummary]]                                           | Aggregated health for all services                    | [[apps/frontend/src/hooks/useFleetSummary.ts]]      |
| [[docs/components/use-service-instances\|useServiceInstances]]                                    | Multi-instance service management                    | [[apps/frontend/src/hooks/useServiceInstances.tsx]] |
| [[docs/components/use-enabled-services\|useEnabledServices]]                                      | Enabled services configuration                       | [[apps/frontend/src/hooks/useEnabledServices.ts]]   |

### WebSocket & Realtime Hooks

| Hook                                                                                              | Description                                           | File                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| [[docs/components/use-websocket-hook\|useWebSocket]]                                              | Singleton WebSocket connection (internal to provider) | [[apps/frontend/src/hooks/useWebSocket.ts]]         |
| `useWebSocketContext()`                                                                           | Access connection state (isConnected, reconnectAttempts) | [[apps/frontend/src/providers/WebSocketProvider.tsx]] |
| `useWebSocketEvent(type)`                                                                         | Subscribe to specific WebSocket message type          | [[apps/frontend/src/hooks/useWebSocket.ts]]         |

### Auth Hooks

| Hook                                                                                              | Description                                           | File                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| [[docs/components/use-auth-hook\|useAuth]]                                                        | Authentication state and login/logout                 | [[apps/frontend/src/hooks/useAuth.tsx]]             |
| [[docs/components/use-config-hook\|useFrontendConfig (replaced useConfig)]]                       | Frontend runtime configuration    | [[apps/frontend/src/hooks/useFrontendConfig.ts]]    |
| [[docs/components/use-mobile-hook\|use-mobile]]                                                   | Mobile breakpoint detection       | [[apps/frontend/src/hooks/use-mobile.tsx]]          |
| [[docs/components/use-toast-hook\|use-toast]]                                                     | Toast notifications               | [[apps/frontend/src/hooks/use-toast.ts]]            |

### Hook Coverage Notes

- [[apps/frontend/src/hooks/use-toast.test.tsx]] covers reducer and hook lifecycle behavior for [[apps/frontend/src/hooks/use-toast.ts]] (toast limit, dismiss-all, add/update/dismiss/remove lifecycle).
- [[apps/frontend/src/hooks/use-mobile.test.tsx]] covers breakpoint reactivity and unmount cleanup behavior for [[apps/frontend/src/hooks/use-mobile.tsx]].
- [[apps/frontend/src/hooks/useWebSocket.test.tsx]] expanded coverage includes tor/router invalidation families, metrics invalidation + connection toast handling, max reconnect-attempts error path, and cleanup stability for [[apps/frontend/src/hooks/useWebSocket.ts]].

## Pages

| Page         | Route              | File                                     |
| ------------ | ------------------ | ---------------------------------------- |
| Dashboard    | `/`                | [[apps/frontend/src/pages/Index.tsx]]    |
| Login        | `/login`           | [[apps/frontend/src/pages/Login.tsx]]    |
| Backup       | `/settings/backup` | [[docs/components/backup-restore\|BackupRestore]] |
| Not Found    | `*`                | [[apps/frontend/src/pages/NotFound.tsx]] |

### Page Test Coverage Notes

- Dashboard page coverage added in [[apps/frontend/src/pages/Index.test.tsx]] for [[apps/frontend/src/pages/Index.tsx]] (now ~88% lines).

## Services and Utilities

| Module                | Description                                    | File                                                                                                                       |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ApiClient`           | Public HTTP client wrapper                     | [[apps/frontend/src/services/ApiClient.ts]]                                                                                |
| `apiClient/core`      | Request pipeline (retry/dedup/timeout/headers) | [[apps/frontend/src/services/apiClient/core.ts]]                                                                           |
| `apiClient/endpoints` | Endpoint method layer                          | [[apps/frontend/src/services/apiClient/endpoints.ts]]                                                                      |
| `apiClient/types`     | Shared API response/request types              | [[apps/frontend/src/services/apiClient/types.ts]]                                                                          |
| `queryKeys`           | Centralized React Query key factory            | [[apps/frontend/src/lib/queryKeys.ts]]                                                                                     |
| Dashboard helpers     | Extracted dashboard status/data helpers        | [[apps/frontend/src/components/dashboard/dashboardStatus.ts]], [[apps/frontend/src/components/dashboard/dashboardData.ts]] |

### Dashboard Helper Test Coverage Notes

- [[apps/frontend/src/components/dashboard/dashboardData.test.ts]] validates dashboard data helper behavior in [[apps/frontend/src/components/dashboard/dashboardData.ts]].
- [[apps/frontend/src/components/dashboard/dashboardStatus.test.ts]] validates status mapping and aggregate counter derivation in [[apps/frontend/src/components/dashboard/dashboardStatus.ts]].
- [[apps/frontend/src/hooks/useWebSocket.test.tsx]] expands hook-level real-time coverage tied to dashboard refresh behavior via query invalidation.

> [!note]
> Legacy files removed during refactors: `use-config.tsx`, `useServicesHealth.ts`, `RequestOptimizer.ts`, `OptimizedServiceCard.tsx`, and `PerformantServiceCard.tsx`.

## Design System

The new dark-luxury design system provides a cohesive visual language:

- **Tokens**: OKLCH color spaces, 12-step spacing scale, typography scale (8 sizes), motion (3 durations, 2 easing functions)
- **Elevation**: 3-level shadow system with inset hairlines
- **Typography**: Geist Variable (sans) + Geist Mono Variable (mono, tabular numerals)
- **Motion**: Keyframes (tile-enter, sheet-enter/exit, fade, skeleton), reduced-motion support
- **Tailwind**: All tokens mapped to utilities (colors, spacing, radii, durations, shadows, fonts)

See [[docs/architecture/frontend-design-system|Frontend Design System]] for complete reference.

## UI Components (shadcn/ui — Legacy)

The `ui/` directory contains shadcn/ui components. These are standard library components and typically don't need individual documentation. **Note**: These are scheduled for gradual replacement by primitives as Phase 3–6 proceed.

`[[apps/frontend/src/components/ui/button.tsx]]`, `[[apps/frontend/src/components/ui/card.tsx]]`, `[[apps/frontend/src/components/ui/badge.tsx]]`, `[[apps/frontend/src/components/ui/dialog.tsx]]`, `[[apps/frontend/src/components/ui/alert.tsx]]`, `[[apps/frontend/src/components/ui/tooltip.tsx]]`, `[[apps/frontend/src/components/ui/input.tsx]]`, `[[apps/frontend/src/components/ui/select.tsx]]`, `[[apps/frontend/src/components/ui/checkbox.tsx]]`, `[[apps/frontend/src/components/ui/switch.tsx]]`, `[[apps/frontend/src/components/ui/slider.tsx]]`, `[[apps/frontend/src/components/ui/tabs.tsx]]`, `[[apps/frontend/src/components/ui/form.tsx]]`, and 30+ more.

## Related

- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/architecture/frontend-design-system|Frontend Design System]]
- [[docs/components/primitives/index|Primitive Components Index]]
- [[docs/guides/adding-services|Adding Services Guide]]
- [[docs/testing/testing-strategy|Testing Strategy]]
