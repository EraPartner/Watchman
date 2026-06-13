---
title: Bento Layout Configuration
type: reference
status: active
date: 2026-06-13
tags: [configuration, bento, frontend, grid, layout, phase3]
description: Data-driven grid layout configuration for the bento dashboard. Ordered array of service kind and tile size pairs.
aliases: [bento layout, layout config]
---

# Bento Layout Configuration

> [!abstract] Overview
> The bento layout is defined as a simple ordered array of `{ kind, size }` entries. This drives the order and sizing of tiles in the `DashboardGrid`. Fully data-driven; no hardcoded placement logic.

## Location

`[[apps/frontend/src/config/bentoLayout.ts]]`

## Configuration

```typescript
export interface BentoLayoutEntry {
  kind: ServiceKind;
  size: TileSize; // "S" | "M" | "L" | "XL"
}

// Mirrors apps/frontend/src/config/bentoLayout.ts (canonical camelCase kinds).
export const BENTO_LAYOUT: BentoLayoutEntry[] = [
  { kind: "bitcoin", size: "XL" },
  { kind: "synology", size: "L" },
  { kind: "router", size: "S" },
  { kind: "adguard", size: "M" },
  { kind: "qbittorrent", size: "M" },
  { kind: "ipfs", size: "M" },
  { kind: "tor", size: "M" },
  { kind: "homebridge", size: "M" },
  { kind: "macMini", size: "M" },
  { kind: "raspberryPi", size: "M" },
  { kind: "albyHub", size: "S" },
  { kind: "philipsBridge", size: "S" },
  { kind: "roon", size: "S" },
];
```

## Grid Layout Visual

With 12-column grid and 72px base row height:

```
12-column grid, sized by tier (mirrors BENTO_LAYOUT, in order):

XL  │ Bitcoin
L   │ Synology
M   │ AdGuard · qBittorrent · IPFS · Tor · Homebridge · MacMini · RaspberryPi
S   │ Router · AlbyHub · Philips · Roon
```

## Size Semantics

Tile size scales with how much each card shows — more metrics and charts warrant a larger footprint.

- **XL** — Flagship services with the most data (Bitcoin: block height, mempool, fees, charts)
- **L** — Major infrastructure with rich telemetry (Synology: CPU/RAM/disk with charts)
- **M** — Standard services with several metrics (apps, downloaders, bridges)
- **S** — Reachability-only or minimal-field tiles (Router: shows reachability + a couple of fields; AlbyHub, Philips Hue, Roon in base mode)

## Modification Guide

To change the layout:

1. Reorder entries to change flow (CSS Grid auto-places left-to-right, top-to-bottom)
2. Change tile size (e.g., `"M"` → `"L"`) for emphasis
3. Add new services as they gain renderers (Phases 4–6)

Example: Promote Roon to M-size:

```typescript
{ kind: "roon", size: "M" },     // Was "S"
```

Grid will reflow; no code changes needed.

## Phase 3 Pilot

Phase 3 only has Bitcoin and Synology renderers implemented. All other services are stubbed:

```typescript
// Phase 3: Implemented
{ kind: "bitcoin", size: "XL" },
{ kind: "synology", size: "L" },

// Phase 3: Stubbed (no renderer yet)
{ kind: "adguard", size: "M" },
{ kind: "tor", size: "M" },
// ...
```

When rendered, `BentoDashboard` filters the layout:

```typescript
const entries = BENTO_LAYOUT.filter((e) => getRenderer(e.kind));
```

In Phase 3, this produces a 3-tile dashboard (Bitcoin XL, Synology L, Router S). Phase 4 will complete the remaining renderers and show all 16 tiles.

## Responsive Adjustments

The grid respects responsive media queries in `DashboardGrid`:

- **Desktop**: 12-col, full sizes
- **Tablet**: 6-col, XL→L collapse
- **Mobile**: 2-col, all→S

The layout array stays the same; CSS Media Queries apply the collapse.

## Future: User-Customizable Layouts

Post-Phase 6, consider:

1. Loading layout from localStorage
2. Drag-to-reorder tiles
3. Save multiple presets (e.g., "operations", "metrics", "alerts")
4. Per-tile density toggle (compact/comfortable)

This would add a UI to edit layout without code changes, with fallback to BENTO_LAYOUT as default.

## Related

- [[docs/components/dashboard-grid|DashboardGrid]]
- [[docs/components/bento-dashboard|BentoDashboard]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
