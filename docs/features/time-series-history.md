---
title: Time-Series History
type: feature
status: superseded
date: 2026-05-07
tags: [feature, timeseries, history, metrics, backend, duckdb, phase1, archived, superseded-by-adr-019]
description: Time-series metrics collection and querying with DuckDB - SUPERSEDED by ADR-019 (feature removed, archived for historical reference)
aliases: [time-series, metrics history, rollup tiers, DuckDB metrics]
---

# Time-Series History Feature (ARCHIVED)

> [!warning] SUPERSEDED — Archived for Historical Reference
> This feature was removed as part of [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]]. The persistent DuckDB time-series layer (metrics tables, rollup workers, history endpoint, and charting UI) has been deleted. The document below is preserved for historical context.
>
> Time-series storage, history endpoint, and persistent metric charts are no longer available. The dashboard provides real-time status and an in-memory recent-activity ring buffer only.

## Phase 1: Backend Implementation (LIVE)

### What's Included

1. **Time-Series Storage** — DuckDB database with 5 tables:
   - `metric_raw` — Raw metrics (6-hour retention)
   - `metric_1m` — 1-minute rollup (48-hour retention)
   - `metric_5m` — 5-minute rollup (14-day retention)
   - `metric_1h` — 1-hour rollup (30-day retention)
   - `rollup_state` — Watermark tracking for background workers

2. **Metrics Collection** — EventBus-driven writer:
   - Subscribes to `service.stats.updated` event
   - Batches raw metrics (1-second cadence, ≤500 rows)
   - Drops non-finite values
   - Writes to `metric_raw` table

3. **Automatic Rollups** — Background workers (setTimeout-based):
   - **1m tier**: Processes every 30 seconds; rolls raw → 1m
   - **5m tier**: Processes every 2 minutes; rolls 1m → 5m
   - **1h tier**: Processes every 10 minutes; rolls 5m → 1h
   - Uses time_bucket window functions; tracks watermark in `rollup_state`
   - Prunes source + target buckets per retention policy

4. **History Endpoint** — `GET /services/{kind}/history`
   - Query metrics by service kind, metric name, time range
   - Auto-selects resolution (raw/1m/5m/1h) based on window size
   - Supports aggregations: avg, min, max, last
   - Enforces 30-day max window, 20k point limit
   - See [[docs/api/history|History API Docs]] for full spec

### Architecture

#### Data Model

All tiers share a common shape to enable uniform rollups:

```sql
-- Raw (6h retention)
metric_raw(ts, kind, instance_id, metric, value_num, value_text, value_bool)

-- Rollup tiers (48h, 14d, 30d retention)
metric_1m/5m/1h(ts, kind, instance_id, metric, min_v, max_v, avg_v, last_v, sample_count)
```

Each row contains:
- `ts` — Bucket start time (timestamp)
- `kind` — Service type (e.g., "bitcoin")
- `instance_id` — Instance identifier (e.g., "main")
- `metric` — Metric name (e.g., "block_height")
- For raw: `value_num`, `value_text`, `value_bool` (one is populated)
- For rollup: min/max/avg/last (aggregates), sample_count

#### Component Breakdown

| Component | File | Responsibility |
| --------- | ---- | -------------- |
| **Schema** | [[apps/backend/src/infra/timeseries/schema.sql|schema.sql]] | 5 tables + indexes |
| **Migration Runner** | [[apps/backend/src/infra/timeseries/migrations.ts|migrations.ts]] | Split schema into statements, apply idempotently |
| **Connection Pool** | [[apps/backend/src/infra/timeseries/DuckDbPool.ts|DuckDbPool.ts]] | Wraps DuckDBInstance, manages connections |
| **Timestamp Helper** | [[apps/backend/src/infra/timeseries/duckdbTime.ts|duckdbTime.ts]] | Convert Date → DuckDB timestamp (avoids int32 overflow) |
| **Writer** | [[apps/backend/src/infra/timeseries/TimeSeriesWriter.ts|TimeSeriesWriter.ts]] | Listens to EventBus, batches raw metrics |
| **Reader** | [[apps/backend/src/infra/timeseries/TimeSeriesReader.ts|TimeSeriesReader.ts]] | Query by kind/instance/metric/from/to/resolution |
| **Rollup Worker** | [[apps/backend/src/infra/timeseries/RollupWorker.ts|RollupWorker.ts]] | Background job: 1m/5m/1h rollups + pruning |
| **Use Case** | [[apps/backend/src/application/GetServiceHistory.ts|GetServiceHistory.ts]] | Query handler with validation + 30d limit |
| **Route** | [[apps/backend/src/transport/http/routes/history.ts|routes/history.ts]] | HTTP handler for `/services/{kind}/history` |

#### EventBus Coupling

```typescript
// Writer listens to service stats updates
eventBus.on('service.stats.updated', (event) => {
  // Batch and write raw metrics to DuckDB
})
```

When a service is polled and stats are collected, the event is fired; the writer captures and persists metrics.

#### Feature Flag

Controlled by environment variable:

```bash
TIMESERIES_ENABLED=true|false  # default: true
```

When enabled, the writer and rollup worker start on server boot. Database path defaults to `{DATA_DIR}/timeseries.duckdb` (where `DATA_DIR` env var sets the data directory; default `./data`).

### Retention Tiers

| Tier | Interval | Retention | Use Case |
| ---- | -------- | --------- | -------- |
| **raw** | Original poll cadence (~10s) | 6 hours | High granularity, real-time debugging |
| **1m** | 1 minute (60s buckets) | 48 hours | Last 2 days, detail view |
| **5m** | 5 minutes (300s buckets) | 14 days | Week/fortnight overview |
| **1h** | 1 hour (3600s buckets) | 30 days | Month-long trends |

### Auto-Resolution Logic

Queries without explicit `resolution` auto-select based on the requested time window:

| Window | Selected Tier | Rationale |
| ------ | ------------- | --------- |
| ≤ 1 hour | `raw` | Preserve detail for short windows |
| 1–24 hours | `1m` | Balance detail + compression for day views |
| 1–7 days | `5m` | Reduce points for week views |
| > 7 days | `1h` | Aggregate to 1h for month+ views |

### Rollup Algorithm

Each tier uses `time_bucket` to group raw metrics into windows, computing aggregates:

```sql
INSERT INTO metric_1m
SELECT 
  time_bucket('1 minute', ts) AS ts,
  kind,
  instance_id,
  metric,
  MIN(value_num) AS min_v,
  MAX(value_num) AS max_v,
  AVG(value_num) AS avg_v,
  LAST(value_num) AS last_v,
  COUNT(*) AS sample_count
FROM metric_raw
WHERE ts >= last_processed_bucket AND ts < current_bucket
GROUP BY time_bucket(...), kind, instance_id, metric
```

After each tier completes, it:
1. Updates `rollup_state.last_bucket` to mark progress
2. Prunes old rows from source table (e.g., raw > 6h old)
3. Prunes old rows from target table per retention (e.g., 1m > 48h old)

### Testing

[[apps/backend/src/infra/timeseries/timeseries.test.ts|timeseries.test.ts]] includes 9 vitest cases:

- Schema migrations apply idempotently
- Raw metrics write and read
- 1m rollup computes min/max/avg/last/count correctly
- 1m→5m rollup uses weighted average (respects sample_count)
- Watermark advances correctly
- Auto-resolution picks correct tier
- All tests green on Phase 1

## Phases 2–6: Frontend Visualization

### Phase 2: Design System & Primitives (LIVE)

✅ Complete. Dark-luxury OKLCH tokens, Geist typography, 14 custom primitives.

### Phase 3: Bento Dashboard & Renderer Registry (LIVE)

✅ Complete (pilot phase). Generic `ServiceTile`, `DashboardGrid`, `ServiceDetailSheet`. Bitcoin and Synology renderers implemented. Launched behind `?bento=1` query flag.

**Features**:
- One `<ServiceTile>` replaces 18 service-specific `*Card.tsx` components
- `ServiceRenderer` registry drives summary metrics, detail groups, and tone
- 12-column bento grid with auto-placement
- Right-anchored detail sheet with tabbed interface
- Multi-instance support via `instanceId` prop

**Pending phases** (Phases 4–6):

- **Phase 4**: Complete remaining 14 service renderers
- **Phase 5**: visx chart rendering in detail sheet; WebSocket-driven real-time updates; range picker (1h/24h/7d/30d)
- **Phase 6**: Remove legacy `LiveServerDashboard` + 18 `*Card.tsx`; promote bento to default; delete shadcn/ui layer

See [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] for the full roadmap.

## Configuration

### Enable/Disable

```bash
# .env.local
TIMESERIES_ENABLED=true
```

### Database Location

```bash
DATA_DIR=./data  # TimeSeries DB: ./data/timeseries.duckdb
```

### Environment Variables

See [[docs/reference/environment-variables#timeseries|Environment Variables Reference]].

## API

- **Endpoint**: `GET /services/{kind}/history`
- **Query params**: kind, metric, from, to, resolution, agg, limit
- **Docs**: [[docs/api/history|History API Documentation]]
- **OpenAPI**: [[apps/backend/openapi.yaml#L107|/services/{kind}/history]]

## Implementation Files

```
apps/backend/src/infra/timeseries/
├── schema.sql                  # DDL for 5 tables
├── migrations.ts              # Migration runner
├── DuckDbPool.ts              # Connection pool
├── duckdbTime.ts              # Timestamp conversion
├── TimeSeriesWriter.ts        # EventBus → raw metrics
├── TimeSeriesReader.ts        # Query builder + auto-resolution
├── RollupWorker.ts            # Background rollup jobs
└── timeseries.test.ts         # 9 test cases

apps/backend/src/application/
└── GetServiceHistory.ts       # Use case (validation + reader)

apps/backend/src/transport/http/routes/
└── history.ts                 # HTTP handler

apps/backend/src/
├── index.ts                   # Boot writer/worker lifecycle
└── config/env.ts              # TIMESERIES_ENABLED flag
```

## Related

- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014: Time-Series + Bento Design System]]
- [[docs/api/history|History API Endpoint Documentation]]
- [[docs/reference/environment-variables|Environment Variables]]
- [[docs/architecture/backend-architecture|Backend Architecture]]
