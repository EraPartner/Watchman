---
title: BentoDashboard Component
type: component
status: active
date: 2026-04-18
tags: [component, bento, dashboard, page, frontend, phase3]
description: Main page component for the bento dashboard. Layout orchestrator combining DashboardGrid, ServiceTile, and ServiceDetailSheet. Gated behind ?bento=1 query flag in Phase 3.
aliases: [BentoDashboard, bento page, dashboard page]
---

# BentoDashboard Component

> [!abstract] Overview
> `BentoDashboard` is the Phase 3 flagship page component for the new bento-driven dashboard layout. It orchestrates the grid, tiles, and detail sheet, implementing state for which service is currently in focus. Currently live behind the `?bento=1` query flag; will become the default after Phase 6.

## Location

`[[apps/frontend/src/components/dashboard/BentoDashboard.tsx]]`

## Props

None. Designed as a page component (mounted directly in routing).

## Structure

```
BentoDashboard
├── TooltipProvider (context for primitives)
├── main
│   ├── header
│   │   ├── Label: "Watchman · Bento"
│   │   └── h1: "Service dashboard"
│   ├── DashboardGrid
│   │   └── ServiceTile[] (filtered from BENTO_LAYOUT)
│   └── ServiceDetailSheet (for currently selected service)
```

## State Management

### Open Context

```typescript
interface OpenCtx {
  kind: ServiceKind;
  instanceId?: string;
}

const [openCtx, setOpenCtx] = useState<OpenCtx | null>(null);
```

Tracks which service detail sheet is currently open. Persists across tile re-renders.

### Layout Filtering

```typescript
const entries = BENTO_LAYOUT.filter((e) => getRenderer(e.kind));
```

Only renders tiles for services that have an implemented renderer. In Phase 3, Bitcoin and Synology are live; rest are stubbed for Phase 4.

## Behavior

### Initial Load

1. Renders filtered `BENTO_LAYOUT` entries
2. Each entry becomes a `<ServiceTile>`
3. Detail sheet closed (`openCtx = null`)

### On Tile Click

- Tile calls `onOpenDetail({ kind, instanceId })`
- Updates `openCtx`
- Detail sheet opens with that service's renderer

### On Sheet Close

- `onOpenChange(false)` → sets `openCtx = null`
- Sheet slides out

### On Service Change

- User can click a different tile
- `openCtx` updates; sheet immediately shows new service

## Styling

```tsx
<main className="min-h-screen bg-[var(--surface-0)] px-s-8 py-s-10 text-[var(--text-hi)]">
```

- **Background**: Design token `--surface-0` (darkest surface)
- **Text**: `--text-hi` (highest contrast text)
- **Padding**: `px-s-8` (horizontal spacing), `py-s-10` (vertical)

### Header

```tsx
<header className="mb-s-8 space-y-s-2">
  <p className="text-fs-label uppercase tracking-[0.12em] text-[var(--text-lo)]">
    Watchman · Bento
  </p>
  <h1 className="text-fs-h1 font-[700] tracking-[-0.02em]">
    Service dashboard
  </h1>
</header>
```

- **Label**: All-caps, letter-spaced, lower contrast
- **Heading**: H1, dark-luxury tracking-tight, bold weight

## Phase 3 Pilot Services

- **Bitcoin** — Full XL tile with Bitcoin-specific metrics
- **Synology** — Full L tile with storage/system metrics
- **Rest** — Stubbed renderers that will ship in Phase 4

To enable a new service, add it to `[[apps/frontend/src/services/renderers/{service}.ts]]` with a full renderer and export from `index.ts`. Phase 4 will complete all 14 service renderers.

## Integration with App Routing

Currently mounted via lazy import in `[[apps/frontend/src/App.tsx]]`:

```typescript
const BentoDashboardPage = lazy(() =>
  import("@/components/dashboard/BentoDashboard")
);
```

Routed with:
```tsx
{
  path: "/?bento=1",  // Behind query flag in Phase 3
  element: <BentoDashboardPage />,
}
```

Will become the default dashboard (replacing `LiveServerDashboard`) after Phase 6 refactor.

## Accessibility

- Semantic HTML (main, header, nav hierarchy)
- TooltipProvider supplies ARIA context for all descendant tooltips
- ServiceTile and ServiceDetailSheet handle focus/keyboard
- Screen readers announce service names and status

## Performance

- **Lazy loading**: Component code-splits via React Router
- **Query deduping**: React Query caches health/stats queries; multiple tiles requesting same service share results
- **Memoization**: ServiceTile accepts `size` and `kind`; consider wrapping in `memo()` if re-renders become noisy

## Responsive Layout

- **Desktop (≥1024px)**: Full 12-col grid with varied tile sizes
- **Tablet (768px–1024px)**: 6-col grid; XL tiles collapse to L
- **Mobile (<768px)**: 1–2 col stack; all tiles become S

Detail sheet behavior:
- **Desktop/Tablet**: Right-anchored, 40–50vw width
- **Mobile**: Full-screen modal overlay

## Testing

- Unit tests planned for Phase 4: open/close state, filter logic, renderer dispatch
- Integration tests: tile interaction → sheet display flow
- E2E: Bento flag routing, tile click → sheet opens

## Related

- [[docs/components/service-tile|ServiceTile]]
- [[docs/components/service-detail-sheet|ServiceDetailSheet]]
- [[docs/components/dashboard-grid|DashboardGrid]]
- [[docs/config/bento-layout|Bento Layout Configuration]]
- [[docs/services/renderers/index|Renderer Registry]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
