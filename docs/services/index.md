---
title: Frontend Services
type: index
status: active
date: 2026-06-13
tags: [service, index, frontend, api-client, renderers, phase3]
description: Frontend service layer including API client, query keys, and renderer registry
aliases: [services index, frontend services]
---

# Frontend Services

> [!abstract] Overview
> The frontend services layer provides API communication, centralized query key management, and per-service UI customization via the renderer registry (Phase 3).

## API Client

Public HTTP client wrapper with request pipeline (retry, dedup, timeout, headers).

| Module        | Location                                                | Purpose                    |
| ------------- | ------------------------------------------------------- | -------------------------- |
| **ApiClient** | `[[apps/frontend/src/services/ApiClient.ts]]`           | Public HTTP client wrapper |
| **core**      | `[[apps/frontend/src/services/apiClient/core.ts]]`      | Request pipeline           |
| **endpoints** | `[[apps/frontend/src/services/apiClient/endpoints.ts]]` | Endpoint method layer      |
| **types**     | `[[apps/frontend/src/services/apiClient/types.ts]]`     | Shared API types           |

## Query Keys

Centralized React Query key factory.

| Module        | Location                                 | Purpose           |
| ------------- | ---------------------------------------- | ----------------- |
| **queryKeys** | `[[apps/frontend/src/lib/queryKeys.ts]]` | Query key factory |

## Renderer Registry (Phase 3)

Per-service UI customization for the bento dashboard. Each service renderer defines:

- Summary metrics for tile view
- Detail metric groups for sheet view
- Chart specs for visualization (Phase 5)
- Tone derivation (status logic)
- Optional quick-links and subtitles

See [[docs/services/renderers/index|ServiceRenderer Registry]] for complete documentation.

### Renderer Implementation Status

All 13 service kinds have a shipped renderer; `RENDERERS` in `index.ts` is an exhaustive `Record<ServiceKind, ServiceRenderer>` (see [[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025]]).

| Service      | Status | Location                                                    |
| ------------ | ------ | ----------------------------------------------------------- |
| Bitcoin      | ✅     | `[[apps/frontend/src/services/renderers/bitcoin.ts]]`       |
| Synology     | ✅     | `[[apps/frontend/src/services/renderers/synology.ts]]`      |
| AdGuard Home | ✅     | `[[apps/frontend/src/services/renderers/adguard.tsx]]`      |
| Tor          | ✅     | `[[apps/frontend/src/services/renderers/tor.ts]]`           |
| qBittorrent  | ✅     | `[[apps/frontend/src/services/renderers/qbittorrent.tsx]]`  |
| IPFS         | ✅     | `[[apps/frontend/src/services/renderers/ipfs.ts]]`          |
| Homebridge   | ✅     | `[[apps/frontend/src/services/renderers/homebridge.ts]]`    |
| Alby Hub     | ✅     | `[[apps/frontend/src/services/renderers/albyHub.ts]]`       |
| Roon         | ✅     | `[[apps/frontend/src/services/renderers/roon.ts]]`          |
| Philips Hue  | ✅     | `[[apps/frontend/src/services/renderers/philipsBridge.ts]]` |
| Mac Mini     | ✅     | `[[apps/frontend/src/services/renderers/macMini.ts]]`       |
| Raspberry Pi | ✅     | `[[apps/frontend/src/services/renderers/raspberryPi.ts]]`   |
| Router       | ✅     | `[[apps/frontend/src/services/renderers/router.ts]]`        |

### Renderer Utilities

| Module         | Location                                                 | Purpose                    |
| -------------- | -------------------------------------------------------- | -------------------------- |
| **types**      | `[[apps/frontend/src/services/renderers/types.ts]]`      | Type definitions           |
| **formatters** | `[[apps/frontend/src/services/renderers/formatters.ts]]` | Shared metric formatters   |
| **index**      | `[[apps/frontend/src/services/renderers/index.ts]]`      | Registry and getRenderer() |

## Related

- [[docs/components/service-tile|ServiceTile Component]]
- [[docs/components/service-detail-sheet|ServiceDetailSheet Component]]
- [[docs/components/bento-dashboard|BentoDashboard Component]]
- [[docs/services/renderers/index|ServiceRenderer Registry]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
