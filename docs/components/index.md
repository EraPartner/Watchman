---
title: Frontend Components
type: index
status: active
date: 2026-04-09
tags: [component, index, frontend, ui]
description: Index of all React component and hook documentation for the Watchman frontend
aliases: [components index, react components, ui components]
---

# Frontend Components

> [!abstract] Overview
> Watchman's frontend is built with React 18, TypeScript, Tailwind CSS, and shadcn/ui components.

## Component Documentation

```dataview
TABLE WITHOUT ID file.link AS "Component", date AS "Date", status AS "Status"
FROM "docs/components"
WHERE type = "component"
SORT file.name ASC
```

## Service Cards

| Component                                                  | Service      | File                                                   |
| ---------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| [[docs/components/adguard-card\|AdGuardCard]]              | AdGuard Home | [[apps/frontend/src/components/AdGuardCard.tsx]]       |
| [[docs/components/bitcoin-card\|BitcoinCard]]              | Bitcoin      | [[apps/frontend/src/components/BitcoinCard.tsx]]       |
| [[docs/components/tor-card\|TorCard]]                      | Tor          | [[apps/frontend/src/components/TorCard.tsx]]           |
| [[docs/components/qbittorrent-card\|QBittorrentCard]]      | qBittorrent  | [[apps/frontend/src/components/QBittorrentCard.tsx]]   |
| [[docs/components/ipfs-card\|IpfsCard]]                    | IPFS         | [[apps/frontend/src/components/IpfsCard.tsx]]          |
| [[docs/components/synology-card\|SynologyCard]]            | Synology     | [[apps/frontend/src/components/SynologyCard.tsx]]      |
| [[docs/components/roon-card\|RoonCard]]                    | Roon         | [[apps/frontend/src/components/RoonCard.tsx]]          |
| [[docs/components/philips-bridge-card\|PhilipsBridgeCard]] | Philips Hue  | [[apps/frontend/src/components/PhilipsBridgeCard.tsx]] |
| [[docs/components/homebridge-card\|HomebridgeCard]]        | Homebridge   | [[apps/frontend/src/components/HomebridgeCard.tsx]]    |
| [[docs/components/macmini-card\|MacMiniCard]]              | Mac Mini     | [[apps/frontend/src/components/MacMiniCard.tsx]]       |
| [[docs/components/albyhub-card\|AlbyHubCard]]              | Alby Hub     | [[apps/frontend/src/components/AlbyHubCard.tsx]]       |
| [[docs/components/raspberry-pi-card\|RaspberryPiCard]]     | Raspberry Pi | [[apps/frontend/src/components/RaspberryPiCard.tsx]]   |
| [[docs/components/router-card\|RouterCard]]                | Router       | [[apps/frontend/src/components/RouterCard.tsx]]        |
| [[docs/components/nostrcheck-card\|NostrcheckCard]]        | Nostrcheck   | [[apps/frontend/src/components/NostrcheckCard.tsx]]    |

## Shared Components

| Component                                                      | Description                 | File                                                     |
| -------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| [[docs/components/server-status-badge\|ServerStatusBadge]]     | Status indicator badge      | [[apps/frontend/src/components/ServerStatusBadge.tsx]]   |
| [[docs/components/error-boundary\|ErrorBoundary]]              | Error boundary wrapper      | [[apps/frontend/src/components/ErrorBoundary.tsx]]       |
| [[docs/components/auth-guard\|AuthGuard]]                      | Route protection wrapper    | [[apps/frontend/src/components/AuthGuard.tsx]]           |
| [[docs/components/service-link\|ServiceLink]]                  | Service link component      | [[apps/frontend/src/components/ServiceLink.tsx]]         |
| [[docs/components/update-badge\|UpdateBadge]]                  | Available updates badge     | [[apps/frontend/src/components/UpdateBadge.tsx]]         |
| [[docs/components/live-server-dashboard\|LiveServerDashboard]] | Main dashboard orchestrator | [[apps/frontend/src/components/LiveServerDashboard.tsx]] |

## Custom Hooks

| Hook                                                                                              | Description                       | File                                                |
| ------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| [[docs/components/use-auth-hook\|useAuth]]                                                        | Authentication state management   | [[apps/frontend/src/hooks/useAuth.tsx]]             |
| [[docs/components/use-websocket-hook\|useWebSocket]]                                              | WebSocket real-time connection    | [[apps/frontend/src/hooks/useWebSocket.ts]]         |
| [[docs/components/use-service-health\|useServiceHealth / useServiceStats / useAllServicesHealth]] | Service health/stats query hooks  | [[apps/frontend/src/hooks/useServiceHealth.ts]]     |
| [[docs/components/use-service-instances\|useServiceInstances]]                                    | Multi-instance service management | [[apps/frontend/src/hooks/useServiceInstances.tsx]] |
| [[docs/components/use-enabled-services\|useEnabledServices]]                                      | Enabled services configuration    | [[apps/frontend/src/hooks/useEnabledServices.ts]]   |
| [[docs/components/use-config-hook\|useFrontendConfig (replaced useConfig)]]                       | Frontend runtime configuration    | [[apps/frontend/src/hooks/useFrontendConfig.ts]]    |
| [[docs/components/use-mobile-hook\|use-mobile]]                                                   | Mobile breakpoint detection       | [[apps/frontend/src/hooks/use-mobile.tsx]]          |
| [[docs/components/use-toast-hook\|use-toast]]                                                     | Toast notifications               | [[apps/frontend/src/hooks/use-toast.ts]]            |

## Pages

| Page      | Route    | File                                     |
| --------- | -------- | ---------------------------------------- |
| Dashboard | `/`      | [[apps/frontend/src/pages/Index.tsx]]    |
| Login     | `/login` | [[apps/frontend/src/pages/Login.tsx]]    |
| Not Found | `*`      | [[apps/frontend/src/pages/NotFound.tsx]] |

## Services and Utilities

| Module            | Description                             | File                                                                                                                       |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ApiClient`       | HTTP client wrapper                     | [[apps/frontend/src/services/ApiClient.ts]]                                                                                |
| `queryKeys`       | Centralized React Query key factory     | [[apps/frontend/src/lib/queryKeys.ts]]                                                                                     |
| Dashboard helpers | Extracted dashboard status/data helpers | [[apps/frontend/src/components/dashboard/dashboardStatus.ts]], [[apps/frontend/src/components/dashboard/dashboardData.ts]] |

> [!note]
> Legacy files removed during refactors: `use-config.tsx`, `useServicesHealth.ts`, `RequestOptimizer.ts`, `OptimizedServiceCard.tsx`, and `PerformantServiceCard.tsx`.

## UI Components (shadcn/ui)

The `ui/` directory contains shadcn/ui components. These are standard library components and typically don't need individual documentation:

`[[apps/frontend/src/components/ui/button.tsx]]`, `[[apps/frontend/src/components/ui/card.tsx]]`, `[[apps/frontend/src/components/ui/badge.tsx]]`, `[[apps/frontend/src/components/ui/dialog.tsx]]`, `[[apps/frontend/src/components/ui/alert.tsx]]`, `[[apps/frontend/src/components/ui/tooltip.tsx]]`, `[[apps/frontend/src/components/ui/input.tsx]]`, `[[apps/frontend/src/components/ui/select.tsx]]`, `[[apps/frontend/src/components/ui/checkbox.tsx]]`, `[[apps/frontend/src/components/ui/switch.tsx]]`, `[[apps/frontend/src/components/ui/slider.tsx]]`, `[[apps/frontend/src/components/ui/tabs.tsx]]`, `[[apps/frontend/src/components/ui/form.tsx]]`, and 30+ more.

## Related

- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/guides/adding-services|Adding Services Guide]]
- [[docs/testing/testing-strategy|Testing Strategy]]
