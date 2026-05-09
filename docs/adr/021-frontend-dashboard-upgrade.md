---
title: Frontend Dashboard Upgrade — Aggregated Fan-Out, Sparklines, Editorial Top-Bar
type: adr
status: proposed
date: 2026-05-09
tags: [adr, frontend, dashboard, performance, design-system, sparklines, navigation, ui]
description: Switch tile fan-out to the aggregated /services endpoint, add a client-side metric history ring buffer for sparklines, introduce a global top-bar nav with summary chip, and finish surfacing every service-specific datapoint in the detail sheet.
aliases: [ADR-021, dashboard upgrade, aggregated tiles, top-bar nav, metric history]
---

# ADR-021: Frontend Dashboard Upgrade

> [!abstract] Summary
> Move tile health reads onto the aggregated `/services` endpoint, introduce a client-side ring buffer that powers tile/sheet sparklines, replace the dashboard header with an editorial top-bar carrying a global up/warn/crit chip, and surface every reported service-specific datapoint (qBittorrent active torrents, AdGuard tops, raw stats fallback, config tab) in the detail sheet.

## Status

- **Status**: Proposed
- **Date**: 2026-05-09

## Context

Phase-3 bento dashboard wired health and stats per-tile. With 14 service kinds this fans out to ~28 HTTP requests per refresh interval even though the backend already exposes a single aggregated `/services` snapshot. Several declared affordances were never finished:

- `Sparkline` primitive imported missing `@visx/*` and `d3-array` packages — would not compile.
- `charts` arrays on every renderer were dead code.
- `quickLink` field on the renderer interface had no implementations and no UI.
- `usePingServiceCard` was unused by any tile.
- The dashboard shell had no nav to Settings / Audit / Backup.
- Tile detail sheets didn't render `activeTorrents`, AdGuard top domains/clients, `recentErrors`, or service-config metadata, even though the backend returned them.
- `index.css` carried a full unused shadcn HSL theme alongside the real OKLCH dark-luxury tokens.

This ADR captures the decisions made to land all of the above in a single pass without walking back ADR-019 (no persistent history).

## Decision

### 1. Aggregated `/services` for tile health

- New `useAggregatedHealth` hook reads `/services` once per 10 s and exposes an `entries` array plus a fast `byKey` map.
- `useServiceHealth(kind, instance)` is now a pure selector over the aggregated query — tiles share one underlying request regardless of count.
- `useServiceStats(kind, instance, enabled, trackedMetrics)` keeps the per-tile fetch (stats payloads vary heavily; aggregating server-side is out of scope) and additionally records numeric samples into the metric history ring buffer.
- `/services/{kind}/health` and `/services/{kind}/stats` remain on the backend; only the frontend tile fan-out moves onto the aggregated endpoint.

### 2. Client-side metric history ring buffer

- New `lib/metricHistory.ts` keeps the last 60 samples per `(kind, instanceId, metricKey)` in a Map, deduped by snapshot timestamp.
- Booleans coerce to 0/1; strings parsed where they're numeric; nested dot-paths supported.
- `useMetricSeries(kind, instance, metric)` is a `useSyncExternalStore` subscription used by tile sparklines and the detail-sheet charts panel.
- ADR-019 stays intact: nothing is persisted; series resets on reload.

### 3. Sparkline rewritten without `@visx/*`

- The primitive is now pure SVG (path + gradient fill + last-point dot), matching the dark-luxury OKLCH tones (`accent`, `ok`, `warn`, `crit`).
- Used inline on M+ tiles and in the detail-sheet `ChartsPanel`.

### 4. Editorial top-bar + global summary

- New `components/dashboard/TopNav.tsx` provides brand mark, nav links (Dashboard, Services, Audit, Backup), aggregate up/warn/crit pill, last-poll relative time, breaker-warning chip from `/metrics`, WebSocket connectivity dot, and `+ Add service` CTA.
- New `pages/Settings/SettingsLayout.tsx` wraps Services / Audit / Backup pages with the same top-bar so the chrome is consistent across routes.
- Dashboard header is now editorial: gold eyebrow rule, clamp() H1, accent hairline, count of active renderers/instances. Atmosphere added with a top-radial accent glow and SVG noise overlay (low-opacity, decorative).

### 5. quickLink on every renderer + tile/sheet UI

- `QuickLinkContext` exposes the configured service to the renderer's link builder; helper `buildQuickLink` normalises bare hosts, ports, schemes and paths.
- Every shipped renderer implements `quickLink` with a sensible default per service (Synology DSM 5000 https, IPFS WebUI 5001/webui, qBittorrent 8080, Homebridge 8581, Hue Bridge https, Tor Metrics by fingerprint, etc.).
- Tiles render an external-link affordance on hover; the detail sheet shows the link in the header.

### 6. Detail-sheet enrichment

- New tabs: Metrics (existing groups), **Charts** (renders `renderer.charts` via `ChartsPanel` + ring buffer), optional **custom panel** (qBittorrent torrents/errors/warnings, AdGuard tops + filter/upstream summary), **Raw** (lists every stats key not surfaced in the detail groups so no datapoint is hidden), **Config** (kind/instance/enabled/created/updated + redacted config + Test connection button), **Events** (existing live WS alerts).
- `RawStatsPanel` flattens nested objects and skips already-shown keys.
- `ConfigPanel` calls the existing `/config/services/:id/test` endpoint via `useTestService` and surfaces the result through `sonner`.

### 7. Cleanup

- Dead shadcn HSL `:root` / `.dark` block removed from `index.css`; only OKLCH tokens remain.
- Health hook signatures simplified (no `options` arg) since aggregated query has shared lifecycle.

## Consequences

### Positive

- ~14× reduction in dashboard HTTP requests for health (1 vs ~14).
- Sparklines and charts now ship with no new dependencies — `Sparkline` is pure SVG.
- Every backend-reported field reaches the user — Raw Stats panel guarantees no silent drops.
- Top-bar nav and per-page consistency reduce friction between dashboard and settings.
- Visual identity matches the project's documented dark-luxury direction without adopting a stock template.

### Negative

- Sparklines are session-scoped only (ADR-019 trade-off) — they need the dashboard to be open to accumulate data.
- Aggregated query is a single point of failure for all tile health; mitigated by per-tile error rendering and React Query retries.
- Tile now reads from `useServices()` to resolve `quickLink` URLs, adding one extra (deduplicated) query when loaded for the first time.

### Risks

- If a renderer's `quickLink` config keys diverge from what `KindSchema` exposes, the link will silently not appear. Mitigated by the centralised `buildQuickLink` defaults and `quickLink.test.ts`.
- Ring buffer growth is bounded per-metric (60 samples) but unbounded across services — typical home-lab deployments stay well under 1 MB.

## Alternatives Considered

| Alternative | Why Rejected |
| ----------- | ------------ |
| Backend ring buffer on `/metrics/history` | Walks back ADR-019. Client-side ring buffer covers session use without server complexity. |
| Tile-aggregated stats too | Stats payloads are kind-specific and large; aggregating server-side would balloon responses. |
| Recharts / visx for charts | New ~120 KB dependency for a sparkline. Pure SVG matches the renderer-driven, low-dep ethos. |
| Side-rail nav | Dashboard hero benefits from horizontal real estate; top-bar is more familiar for an Electron desktop wrapper. |

## References

- [[docs/architecture/frontend-design-system|Frontend Design System]]
- [[docs/components/bento-dashboard|Bento Dashboard]]
- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019: Two-Tier Health]]
- Related code:
  - `[[apps/frontend/src/hooks/useAggregatedHealth.ts]]`
  - `[[apps/frontend/src/lib/metricHistory.ts]]`
  - `[[apps/frontend/src/components/dashboard/TopNav.tsx]]`
  - `[[apps/frontend/src/components/detail/ChartsPanel.tsx]]`
  - `[[apps/frontend/src/components/detail/RawStatsPanel.tsx]]`
  - `[[apps/frontend/src/components/detail/ConfigPanel.tsx]]`
  - `[[apps/frontend/src/services/renderers/quickLink.ts]]`
