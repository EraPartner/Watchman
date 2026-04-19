---
title: DashboardGrid Component
type: component
status: active
date: 2026-04-18
tags: [component, bento, grid, layout, frontend, phase3]
description: 12-column CSS Grid container for bento tile layout. Auto-places ServiceTile children with `grid-auto-rows: 72px` and responsive spacing.
aliases: [DashboardGrid, bento grid, tile grid]
---

# DashboardGrid Component

> [!abstract] Overview
> `DashboardGrid` is a layout container implementing a 12-column CSS Grid. It provides the structural foundation for the bento dashboard, auto-placing `ServiceTile` children based on their size (S/M/L/XL) and respecting responsive breakpoints.

## Location

`[[apps/frontend/src/components/dashboard/DashboardGrid.tsx]]`

## Props

```typescript
interface DashboardGridProps {
  children: React.ReactNode;
  className?: string;
}
```

## Grid Specification

```css
display: grid;
grid-template-columns: repeat(12, minmax(0, 1fr));
grid-auto-rows: 72px;
gap: var(--space-4);  /* Tailwind: gap-s-4 */
```

### Column Layout

- **12 columns** — Accommodates S(1), M(2), L(2), XL(4) tiles
- **Auto rows** — 72px base unit; tiles expand vertically by `row-span`
- **Gap** — Design token spacing (spacing-4 from design system)

### Tile Sizing (via CVA in tileVariants.ts)

| Size | col-span | row-span | Width    | Height   |
| ---- | -------- | -------- | -------- | -------- |
| S    | 1        | 1        | 8.33%    | 72px     |
| M    | 2        | 1        | 16.66%   | 72px     |
| L    | 2        | 2        | 16.66%   | 144px    |
| XL   | 4        | 2        | 33.33%   | 144px    |

## Responsive Behavior

### Desktop (≥1024px)

- Full 12-column grid
- All tile sizes rendered as specified
- No wrapping; tiles auto-flow left-to-right, top-to-bottom

### Tablet (768px–1024px)

- 6-column grid
- XL tiles collapse to L (span 3 cols)
- L tiles remain L (span 3 cols)

### Mobile (<768px)

- 2-column grid (or 1-column for very small screens)
- All tiles render as S (span 1 col)
- Vertical stack

## Implementation

```tsx
export function DashboardGrid({ children, className }: DashboardGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-12 gap-s-4",
        "auto-rows-[72px]",
        "md:grid-cols-6 md:auto-rows-[80px]",
        "sm:grid-cols-2 sm:auto-rows-auto",
        className
      )}
    >
      {children}
    </div>
  );
}
```

## Child Expectations

Children must:
1. Be `ServiceTile` components (or compatible grid items)
2. Accept `size` prop (S/M/L/XL) to set `grid-column-end` and `grid-row-end`
3. Be wrapped in a Surface or equivalent to respect grid cell boundaries

## Layout Configuration

The order and size of tiles come from `[[apps/frontend/src/config/bentoLayout.ts]]`:

```typescript
export const BENTO_LAYOUT: BentoLayoutEntry[] = [
  { kind: "bitcoin", size: "XL" },
  { kind: "synology", size: "L" },
  { kind: "router", size: "L" },
  { kind: "adguard", size: "M" },
  { kind: "tor", size: "M" },
  { kind: "qbittorrent", size: "M" },
  { kind: "ipfs", size: "M" },
  { kind: "homebridge", size: "M" },
  { kind: "albyhub", size: "M" },
  { kind: "roon", size: "S" },
  { kind: "philips", size: "S" },
  { kind: "macmini", size: "S" },
  { kind: "raspi", size: "S" },
  { kind: "nostrcheck", size: "S" },
];
```

The grid renders them in order; CSS Grid auto-places by flow.

## Visual Alignment

### Horizontal Alignment

- Tiles align to column boundaries
- No gaps between tiles within same row (grid handles spacing via `gap`)

### Vertical Alignment

- 72px base row height allows 2-row tiles to occupy 144px
- Mixed heights create a magazine-style layout

### Example Layout

```
┌──────────────────────────────────────────────────────┐
│  Bitcoin (XL: cols 1-4, rows 1-2)                    │ Synology (L: 5-6, 1-2)
│                                                      │
│                                                      ├──────────────────┐
├──────────────────────────────────────────────────────┤ Router (L: 7-8, 1-2)
│ AdGuard (M)  │ Tor (M)      │ qBit (M) │ IPFS (M)    │
├──────────────┼──────────────┼──────────┼─────────────┤
│ Home (M)     │ Alby (M)     │ Roon (S) │ Philips (S) │
├──────────────┴──────────────┴──────────┴─────────────┤
```

## Spacing

- **Gap**: Design token `--space-4` (~1rem)
- **Container padding**: Handled by parent (`BentoDashboard`) with `px-s-8 py-s-10`

## A11y

- Grid itself is semantic (no role needed unless keyboard-navigable)
- Children (ServiceTile) provide focus management
- Screen readers traverse top-to-bottom, left-to-right (DOM order)

## Performance

- CSS Grid is performant; reflows only on window resize
- Children rendered lazily when using React Router code-splitting

## Related

- [[docs/components/service-tile|ServiceTile]]
- [[docs/components/bento-dashboard|BentoDashboard]]
- [[docs/config/bento-layout|Bento Layout Configuration]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
