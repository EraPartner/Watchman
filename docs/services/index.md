---
title: Frontend Services
type: index
status: active
date: 2026-04-18
tags: [service, index, frontend, api-client, renderers, phase3]
description: Frontend service layer including API client, query keys, and renderer registry
aliases: [services index, frontend services]
---

# Frontend Services

> [!abstract] Overview
> The frontend services layer provides API communication, centralized query key management, and per-service UI customization via the renderer registry (Phase 3).

## API Client

Public HTTP client wrapper with request pipeline (retry, dedup, timeout, headers).

| Module          | Location                                         | Purpose                        |
| --------------- | ------------------------------------------------ | ------------------------------ |
| **ApiClient**   | `[[apps/frontend/src/services/ApiClient.ts]]`   | Public HTTP client wrapper     |
| **core**        | `[[apps/frontend/src/services/apiClient/core.ts]]`  | Request pipeline               |
| **endpoints**   | `[[apps/frontend/src/services/apiClient/endpoints.ts]]` | Endpoint method layer          |
| **types**       | `[[apps/frontend/src/services/apiClient/types.ts]]` | Shared API types               |

## Query Keys

Centralized React Query key factory.

| Module        | Location                              | Purpose                    |
| ------------- | ------------------------------------- | -------------------------- |
| **queryKeys** | `[[apps/frontend/src/lib/queryKeys.ts]]` | Query key factory          |

## Renderer Registry (Phase 3)

Per-service UI customization for the bento dashboard. Each service renderer defines:
- Summary metrics for tile view
- Detail metric groups for sheet view
- Chart specs for visualization (Phase 5)
- Tone derivation (status logic)
- Optional quick-links and subtitles

See [[docs/services/renderers/index|ServiceRenderer Registry]] for complete documentation.

### Renderer Implementation Status

| Service          | Status      | Location                                    |
| ---------------- | ----------- | ------------------------------------------- |
| Bitcoin          | ✅ Phase 3  | `[[apps/frontend/src/services/renderers/bitcoin.ts]]`   |
| Synology         | ✅ Phase 3  | `[[apps/frontend/src/services/renderers/synology.ts]]`  |
| AdGuard Home     | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Tor              | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| qBittorrent      | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| IPFS             | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Homebridge       | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Alby Hub         | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Roon             | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Philips Hue      | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Mac Mini         | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Raspberry Pi     | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Router           | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Beryl            | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Telenet          | ⏳ Phase 4  | Stubbed in `index.ts`                       |
| Nostrcheck       | ⏳ Phase 4  | Stubbed in `index.ts`                       |

### Renderer Utilities

| Module          | Location                                        | Purpose                    |
| --------------- | ---------------------------------------------- | -------------------------- |
| **types**       | `[[apps/frontend/src/services/renderers/types.ts]]` | Type definitions           |
| **formatters**  | `[[apps/frontend/src/services/renderers/formatters.ts]]` | Shared metric formatters   |
| **index**       | `[[apps/frontend/src/services/renderers/index.ts]]` | Registry and getRenderer() |

## Related

- [[docs/components/service-tile|ServiceTile Component]]
- [[docs/components/service-detail-sheet|ServiceDetailSheet Component]]
- [[docs/components/bento-dashboard|BentoDashboard Component]]
- [[docs/services/renderers/index|ServiceRenderer Registry]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
