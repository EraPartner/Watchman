---
title: ServiceTile Component
type: component
status: active
date: 2026-05-08
tags: [component, bento, tile, frontend, phase3, two-tier, health, phase-0a]
description: Generic single-tile component replacing all 18 service-specific *Card.tsx components. Driven by ServiceRenderer registry. Includes health query, metrics display, detail-sheet trigger, and two-tier status dots (Phase 0a F1).
aliases: [ServiceTile, bento tile, service card, generic tile, two-tier status dots]
---

# ServiceTile Component

> [!abstract] Overview
> `ServiceTile` is the new generic tile component at the heart of the Phase 3 bento dashboard. It replaces 18 legacy service-specific card components (`BitcoinCard`, `SynologyCard`, etc.). One tile, driven by a `ServiceRenderer` registry, adapts to any service kind.

## Location

`[[apps/frontend/src/components/tile/ServiceTile.tsx]]`

## Props

```typescript
export interface ServiceTileProps {
  kind: ServiceKind;
  instanceId?: string;
  instance?: ServiceInstance;
  size?: TileSize;                              // "S" | "M" | "L" | "XL" (default: "M")
  density?: TileDensity;                        // "comfortable" | "compact" (default: "comfortable")
  onOpenDetail?: (ctx: {
    kind: ServiceKind;
    instanceId?: string;
    renderer: ServiceRenderer;
  }) => void;
  className?: string;
}
```

## Behavior

### Data Queries

- **Health**: `useServiceHealth(kind)` for status (online/warning/error/offline)
- **Stats**: `useServiceStats(kind)` for detailed metrics
- Loading states: renders `Skeleton` while queries are pending

### Rendering

1. **Container**: `Surface` primitive with sizing variants (CVA)
2. **Header**: Status dots + `Badge` (status label) + optional close button
   - When both `host` and `service` tiers present: **two `StatusDot` components** (F1 two-tier status dots — Phase 0a)
     - First dot: host tier with label "host: up/down" and tone `ok` (green) or `crit` (red)
     - Second dot: service tier with label "service: up/down" and tone `ok` (green) or `crit` (red)
   - Otherwise: **single `StatusDot`** for backward compatibility (no tiers or only one tier present)
3. **Primary Metric**: Single `MetricValue` from `renderer.summary[0]`
4. **Secondary Metrics** (if room): 2-column definition list (label + value)
5. **Subtitle**: Optional custom subtitle from `renderer.subtitle(ctx)`

### Tone Computation

Tone is derived from renderer's `tone()` function, which reads health and stats:

```typescript
const tone = renderer.tone({ stats, health, instance });
// Result: "neutral" | "ok" | "warn" | "crit"
```

Maps to SVG color on `StatusDot` and CSS class on surface.

### Interaction

- **Click / Enter / Space**: Opens detail sheet (calls `onOpenDetail`)
- **Keyboard**: Full a11y support (tabindex, role="button")

## Sizing (CVA Variants)

| Size | col-span | row-span | Use Case        |
| ---- | -------- | -------- | --------------- |
| S    | 1        | 1        | Monitoring-only |
| M    | 2        | 1        | Default         |
| L    | 2        | 2        | Feature service |
| XL   | 4        | 2        | Flagship view   |

## Density

- **comfortable**: Default spacing; more visual breathing room
- **compact**: Tighter layout; more tiles per screen

## Integration with Bento Layout

`ServiceTile` is placed in `[[apps/frontend/src/components/dashboard/DashboardGrid.tsx]]` which is a 12-col grid. Tiles are sized according to layout config in `[[apps/frontend/src/config/bentoLayout.ts]]`:

```typescript
const BENTO_LAYOUT = [
  { kind: "bitcoin", size: "XL" },
  { kind: "synology", size: "L" },
  { kind: "router", size: "L" },
  // rest: "M" or "S"
];
```

The grid auto-places tiles by size; detail sheet opens on click.

## ServiceRenderer Registry

Each `ServiceKind` has a corresponding renderer that drives:

1. **summary** — 1–3 metrics for tile view
2. **detail** — Multiple metric groups for sheet view
3. **charts** — Chart specs (used in Phase 5)
4. **tone()** — Health + stats → tone
5. **quickLink()** — URL to native service UI (optional)
6. **subtitle()** — Custom text below primary metric (optional)

Renderers are at `[[apps/frontend/src/services/renderers/{bitcoin,synology,index}.ts]]` and stubbed for remaining services (Phase 4).

## Example: Bitcoin Renderer

```typescript
export const bitcoinRenderer: ServiceRenderer<BitcoinStats> = {
  kind: "bitcoin",
  displayName: "Bitcoin Node",
  summary: [
    {
      key: "block_height",
      label: "Block Height",
      format: (v) => String(v),
    },
    {
      key: "mempool.bytes",
      label: "Mempool",
      format: (v) => formatBytes(v),
    },
  ],
  tone: (ctx) => {
    // Derive tone from health + stats snapshot
    if (!ctx.health?.online) return "crit";
    if (ctx.stats?.syncing) return "warn";
    return "ok";
  },
  // ... detail, charts, etc.
};
```

## Usage in BentoDashboard

```tsx
<DashboardGrid>
  {entries.map((entry) => (
    <ServiceTile
      key={entry.kind}
      kind={entry.kind}
      size={entry.size}
      onOpenDetail={({ kind, instanceId }) => setOpenCtx({ kind, instanceId })}
    />
  ))}
</DashboardGrid>
```

When clicked, opens `<ServiceDetailSheet>` with the renderer's `detail` groups.

## Accessibility

- `role="button"` on tile
- Keyboard support: Enter/Space to open detail sheet
- `StatusDot` uses ARIA labels for tone
- All text is semantic (no decoration-only elements)

## Testing

Two-tier status dots unit tests (Phase 0a — F1):

- `[[apps/frontend/src/components/tile/ServiceTile.test.tsx]]` — 6 tests covering:
  - Two dots render when both `host` and `service` tiers present
  - Single dot fallback when no tiers (backward compat)
  - Single dot when health undefined
  - Host and service tier labels correctly set
  - Partial tier fallbacks (only host or only service tier)
  - Tone mapping: `ok` for reachable, `crit` for unreachable

## Related

- [[docs/components/service-detail-sheet|ServiceDetailSheet]]
- [[docs/components/dashboard-grid|DashboardGrid]]
- [[docs/components/bento-dashboard|BentoDashboard]]
- [[docs/services/renderers/index|Renderer Registry]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
