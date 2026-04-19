---
title: "ADR-014: Time-Series (DuckDB) + Bento Frontend Rewrite"
type: adr
status: accepted
date: 2026-04-18
tags: [adr, architecture, time-series, duckdb, frontend, design-system]
description: Add embedded DuckDB time-series store with tiered rollups and a /history endpoint; rewrite frontend as bento dashboard with renderer registry.
aliases: [adr-014, time-series, bento]
---

# ADR-014: Time-Series (DuckDB) + Bento Frontend Rewrite

> [!abstract] Summary
> Add embedded DuckDB time-series store (raw + 1m/5m/1h rollups, tiered retention) behind a new `/services/:kind/history` endpoint, and rewrite the frontend as a renderer-driven bento dashboard that collapses 18 `*Card.tsx` duplicates into one `<ServiceTile>` + service registry.

## Status

- **Status**: Accepted
- **Date**: 2026-04-18

## Context

Watchman exposed only point-in-time `/services/:kind/health|stats` — no historical store, so the UI could not chart trends. The frontend carried 18 near-duplicate `*Card.tsx` components, a 567-LOC `LiveServerDashboard`, a 50-file shadcn/Radix surface, and a Recharts stub that never rendered. Observed pain:

- No trend visibility across 14+ services polled continuously.
- Rule-of-three violated 18 ways; adding a service required copy-paste.
- Dashboard density and hierarchy generic; no editorial identity.
- Frontend could not tell a story over time; drill-down missing.

Constraints: desktop-only, read-only + quick-links (no mutations), single-binary deployment, multi-instance via aggregate + drill-down.

## Decision

**Backend time-series (Phase 1)**

- Embedded DuckDB at `${DATA_DIR}/watchman.duckdb` via `@duckdb/node-api`.
- Shared row shape across `metric_raw`, `metric_1m`, `metric_5m`, `metric_1h` + a `rollup_state` watermark table — rollups become pure `INSERT … SELECT time_bucket(...)`.
- Retention: raw 6h · 1m 48h · 5m 14d · 1h 30d.
- `TimeSeriesWriter` subscribes to `service.stats.updated` on the in-process EventBus, flattens `metrics` → rows, batches (1s / ≤500 rows) via prepared statements.
- `RollupWorker` uses `setTimeout` (no cron dep); ticks 30s/2min/10min per tier, prunes source + target after each tick.
- `GET /services/:kind/history?instance=&metric=&from=&to=&resolution=&agg=` with auto-resolution (≤1h → raw · ≤24h → 1m · ≤7d → 5m · ≤30d → 1h); rejects >30d windows.
- Gated by `TIMESERIES_ENABLED` env flag; OpenAPI 3.1 spec updated (`HistoryPoint`, `HistoryPayload`, `Resolution`).

**Frontend bento (Phases 2–6)**

- OKLCH token set in `tokens.css`; Geist Variable + Geist Mono (tabular-nums for every numeric metric).
- 14 custom primitives on raw Radix; shadcn layer deleted.
- One `<ServiceTile>` replaces all 18 `*Card.tsx`; variation via CVA size/tone/density + slot renderers.
- `ServiceRenderer` registry (one file per service) drives summary tile, detail sheet, chart specs, and tone.
- 12-col bento grid (`grid-auto-rows: 72px`), layout data-driven in `bentoLayout.ts`.
- `<ServiceDetailSheet>` right-anchored, visx `AreaClosed` charts, range picker `1h|24h|7d|30d`.
- WS singleton replaced with `<WebSocketProvider>` + `useWsQueryBridge` (debounced invalidation).
- Phased rollout behind `?bento=1` flag; legacy deleted in Phase 6.

## Consequences

### Positive

- Historical visibility unlocks charts, deltas, and SLA-style views.
- 18 `*Card.tsx` + `LiveServerDashboard` collapse to one tile + registry entries.
- Embedded DuckDB = single binary, no external dep; columnar + `time_bucket` ergonomic for rollups.
- Shared row shape makes rollups declarative; pruning is a `DELETE` per tier.
- Design system owned end-to-end; no shadcn drift.

### Negative

- Disk footprint grows (bounded by 30d/1h tier).
- DuckDB's Node neo-API is young; some type-boundary quirks (`DuckDBTimestampValue`, int32 bound-param overflow) — mitigated with a `duckdbTime.ts` helper.
- Rewriting the UI layer is a large change; phased flag + parallel legacy path required.

### Risks

- EventBus backpressure under burst polling → writer queues bounded at 500/1s; overflow drops with logger warn.
- Rollup tick collisions with writer appends → single connection serializes; DuckDB WAL handles durability.
- visx bundle weight → tree-shaken, dynamically imported in detail sheet only.

## Alternatives Considered

| Alternative | Why Rejected |
| ----------- | ------------ |
| SQLite + custom rollup triggers | No `time_bucket`; aggregation ergonomics poor; no columnar scans |
| Prometheus + remote write | Operational weight; requires external service; overkill for 14 kinds |
| InfluxDB / TimescaleDB | External daemon breaks single-binary goal |
| Keep shadcn, restyle tokens | Leaves 50 files of drift surface; primitives already thin enough to own |
| One `Card` per service with shared hook | Still 18 files; doesn't address registry-driven detail sheet needs |

## Implementation Status

### Phase 1: Backend Time-Series (LIVE — 2026-04-18)

✅ Complete. DuckDB writer, rollup workers, and `/services/{kind}/history` endpoint operational.

- **Time-Series Feature**: [[docs/features/time-series-history|Time-Series History Feature]]
- **API Documentation**: [[docs/api/history|History API Endpoint]]
- **Backend Code**: `apps/backend/src/infra/timeseries/`, `apps/backend/src/application/GetServiceHistory.ts`, `apps/backend/src/transport/http/routes/history.ts`

### Phase 2: Design System & Primitives (LIVE — 2026-04-18)

✅ Complete. Dark-luxury OKLCH tokens, Geist typography, 14 primitives.

- **Design System**: [[docs/architecture/frontend-design-system|Frontend Design System]]
- **Primitives Index**: [[docs/components/primitives/index|Primitive Components]]

### Phase 3: Bento Dashboard & Renderer Registry (LIVE — 2026-04-18)

✅ Complete (pilot phase). Generic `ServiceTile`, `DashboardGrid`, `ServiceDetailSheet`, and renderer registry. Bitcoin and Synology renderers fully implemented; 14 remaining stubbed for Phase 4.

- **Bento Dashboard**: [[docs/components/bento-dashboard|BentoDashboard Component]]
- **ServiceTile**: [[docs/components/service-tile|ServiceTile Component]]
- **Detail Sheet**: [[docs/components/service-detail-sheet|ServiceDetailSheet Component]]
- **Grid Layout**: [[docs/components/dashboard-grid|DashboardGrid Component]]
- **Renderer Registry**: [[docs/services/renderers/index|ServiceRenderer Registry]]
- **Layout Configuration**: [[docs/config/bento-layout|Bento Layout Configuration]]
- **Code**: `apps/frontend/src/components/{dashboard,tile,detail}/`, `apps/frontend/src/services/renderers/`, `apps/frontend/src/config/bentoLayout.ts`

**Pilot Services**: Bitcoin (XL), Synology (L). Launch: `?bento=1` query flag routes to `BentoDashboard`.

### Phase 4: Remaining Renderers (Pending)

⏳ Not started. 14 service renderers (AdGuard, Tor, qBittorrent, IPFS, Homebridge, AlbyHub, Roon, Philips, Mac Mini, Raspberry Pi, Router, Beryl, Telenet, Nostrcheck).

### Phase 5: visx Charts + Live Updates (Pending)

⏳ Not started. Implement chart rendering in `ServiceDetailSheet` using visx `AreaClosed`. WebSocket-driven real-time updates and range picker (1h/24h/7d/30d).

### Phase 6: Deletion (Pending)

⏳ Not started. Remove legacy `LiveServerDashboard`, 18 `*Card.tsx` components, and 50-file shadcn/ui layer. Promote bento dashboard to default; remove `?bento=1` flag.

## References

- Plan: `/Users/computer/.claude/plans/let-s-plan-a-refactor-polished-lemur.md`
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] (Backend rewrite)
- [[docs/architecture/index|Architecture Overview]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/features/time-series-history|Time-Series History Feature]]
- [[docs/features/service-monitoring|Service Monitoring Feature]]
