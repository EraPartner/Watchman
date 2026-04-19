---
title: Renderer Registry
type: architecture
status: active
date: 2026-04-18
tags: [architecture, frontend, renderers, service-driven, phase3, bento]
description: Service renderer registry driving tile summary, detail-sheet metrics, charts, and tone derivation. One renderer per service kind; pluggable per-service customization.
aliases: [renderer, service renderer, renderer registry]
---

# Renderer Registry

> [!abstract] Overview
> The renderer registry is the core abstraction enabling the bento dashboard to collapse 18 service-specific card components into one generic `ServiceTile`. Each service has a `ServiceRenderer` that defines tile summary metrics, detail-sheet metric groups, chart specs, and tone (status) derivation logic.

## Location

`[[apps/frontend/src/services/renderers/]]`

```
renderers/
├── types.ts           # ServiceRenderer type definitions
├── formatters.ts      # dotGet() and shared metric formatters
├── bitcoin.ts         # Bitcoin-specific renderer
├── synology.ts        # Synology-specific renderer
└── index.ts           # Registry export and getRenderer()
```

## Type Definitions

See `[[apps/frontend/src/services/renderers/types.ts]]`:

```typescript
export type ServiceKind =
  | "bitcoin"
  | "synology"
  | "adguard"
  | "tor"
  | "qbittorrent"
  | "ipfs"
  | // ... 10 more

export type Tone = "neutral" | "ok" | "warn" | "crit";

export interface MetricSpec {
  key: string;              // Dot-path into stats (e.g., "mempool.bytes")
  label: string;            // Display name
  format: MetricFormatter;  // (value) => string
  unit?: string;            // Optional unit (e.g., "sat/vB")
  hint?: string;            // Tooltip hint
}

export interface MetricGroup {
  title: string;
  metrics: MetricSpec[];
}

export type ChartKind = "area" | "line" | "bar" | "sparkline";

export interface ChartSpec {
  metric: string;           // Metric name for querying history
  label: string;
  kind: ChartKind;
  format: MetricFormatter;
  yDomain?: [number, number];
}

export interface RendererContext<S = Record<string, unknown>> {
  stats: S | undefined;
  health: ServiceHealth | undefined;
  instance?: ServiceInstance | undefined;
}

export interface ServiceRenderer<S = Record<string, unknown>> {
  kind: ServiceKind;
  displayName: string;
  quickLink?: (instance: ServiceInstance | undefined) => string | undefined;
  summary: MetricSpec[];                         // 1–3 metrics for tile
  detail: MetricGroup[];                         // Groups for sheet
  charts: ChartSpec[];                           // Chart specs (Phase 5)
  tone: (ctx: RendererContext<S>) => Tone;      // Health + stats → tone
  subtitle?: (ctx: RendererContext<S>) => ReactNode;
}
```

## Formatters

`[[apps/frontend/src/services/renderers/formatters.ts]]` exports:

### `dotGet(obj, path)`

Safe nested object access using dot notation:

```typescript
dotGet({ mempool: { bytes: 123456 } }, "mempool.bytes")  // → 123456
dotGet({ value: null }, "missing.key")                   // → undefined
```

Used internally by `ServiceTile` to extract metric values from stats.

### Common Metric Formatters

- `formatBytes(n)` — Converts bytes to KB/MB/GB/TB
- `formatPercent(n)` — Converts 0–1 or 0–100 to "45%"
- `formatNumber(n)` — Localizes number with thousands separators
- `formatTime(ms)` — Converts milliseconds to human time
- Custom formatters per service (e.g., Bitcoin uses SAT, Synology uses GB)

## Registry API

`[[apps/frontend/src/services/renderers/index.ts]]` exports:

```typescript
export function getRenderer(kind: ServiceKind): ServiceRenderer | undefined
```

Returns the renderer for a given service kind, or undefined if not yet implemented.

Used by:
- `BentoDashboard` to filter `BENTO_LAYOUT` (only render tiles with renderers)
- `ServiceTile` to get summary, detail, tone, and quick-link
- `ServiceDetailSheet` to get detail groups and charts

## Phase 3: Bitcoin & Synology

### Bitcoin Renderer

File: `[[apps/frontend/src/services/renderers/bitcoin.ts]]`

```typescript
export const bitcoinRenderer: ServiceRenderer<BitcoinStats> = {
  kind: "bitcoin",
  displayName: "Bitcoin Node",
  quickLink: (instance) => `http://${instance?.host}:8080`,
  summary: [
    {
      key: "block_height",
      label: "Height",
      format: (v) => String(v),
    },
    {
      key: "mempool.txs",
      label: "Mempool Tx",
      format: (v) => String(v),
    },
    {
      key: "mempool.bytes",
      label: "Mempool Size",
      format: formatBytes,
    },
  ],
  detail: [
    {
      title: "Network",
      metrics: [
        { key: "peers", label: "Peers", format: String },
        { key: "fee_rate", label: "Fee Rate", format: (v) => `${v.toFixed(2)} sat/vB` },
      ],
    },
    {
      title: "Mempool",
      metrics: [
        { key: "mempool.txs", label: "Transactions", format: String },
        { key: "mempool.bytes", label: "Size", format: formatBytes },
      ],
    },
  ],
  charts: [
    {
      metric: "block_height",
      label: "Block Height",
      kind: "area",
      format: String,
      yDomain: undefined,
    },
  ],
  tone: (ctx) => {
    if (!ctx.health?.online) return "crit";
    if (ctx.stats?.syncing) return "warn";
    return "ok";
  },
};
```

### Synology Renderer

File: `[[apps/frontend/src/services/renderers/synology.ts]]`

Similar structure; drives Synology tile with CPU/memory/disk metrics.

## Phase 4: Remaining Renderers (Stubbed)

Placeholders for all 14 service kinds:

```typescript
export const adguardRenderer: ServiceRenderer = {
  kind: "adguard",
  displayName: "AdGuard Home",
  summary: [],       // Will be filled in Phase 4
  detail: [],
  charts: [],
  tone: () => "neutral",
};
```

To implement a renderer in Phase 4:

1. Define the stats type (or import from backend API types)
2. Fill in `summary` (1–3 most important metrics)
3. Fill in `detail` (metric groups for sheet)
4. Implement `tone()` to read health + stats
5. Add `charts` (can be empty if metrics not yet polled)
6. Export from `index.ts`

## Tone Logic

Each renderer implements a `tone()` function that maps health + stats to a tone:

```typescript
tone: (ctx) => {
  const { stats, health, instance } = ctx;

  // Critical: offline
  if (!health?.online) return "crit";

  // Warning: degraded performance or high load
  if (stats?.cpuUsage > 85) return "warn";

  // Normal: operational
  return "ok";
}
```

Tone drives:
- **StatusDot** color on the tile (red/orange/green/gray)
- **Badge** label ("online" / "warning" / "error" / "offline")
- **Surface** background tint (subtle tone highlight)

## Quick Links

Optional `quickLink()` function generates a URL to the native service UI:

```typescript
quickLink: (instance) => {
  if (!instance?.host) return undefined;
  return `http://${instance.host}:8080`;
}
```

When defined, appears as a clickable icon in the tile or sheet header.

## SubTitle

Optional `subtitle()` renders custom text below the primary metric:

```typescript
subtitle: (ctx) => {
  if (!ctx.stats) return null;
  const days = Math.floor(ctx.stats.uptime_seconds / 86400);
  return `Up ${days} days`;
}
```

Used for context-specific callouts (e.g., "Syncing…", "Low disk space").

## Integration with ServiceTile

`ServiceTile` composition:

```tsx
const renderer = getRenderer(kind);
const { data: health } = useServiceHealth(kind);
const { data: stats } = useServiceStats(kind);

// Compute tone
const tone = renderer.tone({ stats, health, instance });

// Render summary metrics
{renderer.summary.map((spec) => (
  <MetricValue
    key={spec.key}
    value={dotGet(stats, spec.key)}
    label={spec.label}
    format={spec.format}
  />
))}
```

## Testing Strategy

Phase 4 will include unit tests per renderer:

- `bitcoin.test.ts`: Tone logic (online/syncing/offline), metric extraction
- `synology.test.ts`: CPU/memory/disk parsing, tone thresholds
- `formatters.test.ts`: dotGet, metric formatters (bytes, percent, etc.)

## Chart Specs (Phase 5)

`charts` array is empty until Phase 5 implements visx rendering. Each `ChartSpec` maps to a metric tracked in DuckDB:

```typescript
charts: [
  {
    metric: "block_height",      // Must match DuckDB metric name
    label: "Block Height",
    kind: "area",                // area | line | bar | sparkline
    format: String,
    yDomain: [0, 800000],        // Optional; auto-scale if omitted
  },
]
```

Phase 5 will query the history API and render these charts in the ServiceDetailSheet.

## Future Enhancements

1. **Renderer context metadata** — Icon URLs, color overrides, service-specific animations
2. **Conditional metric display** — Show metrics only if value is non-null
3. **Aggregation helpers** — Compute deltas, rate-of-change, SLA stats from history
4. **Custom chart types** — Heatmaps, distribution histograms, forecast overlays
5. **Multi-instance renderers** — Different layouts for single vs. multi-instance views

## Related

- [[docs/components/service-tile|ServiceTile]]
- [[docs/components/service-detail-sheet|ServiceDetailSheet]]
- [[docs/components/bento-dashboard|BentoDashboard]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
- [[docs/features/time-series-history|Time-Series History Feature]]
