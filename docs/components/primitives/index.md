---
title: Primitive Components
type: index
status: active
date: 2026-04-18
tags: [primitive, component, index, design-system, dark-luxury]
description: Index of all primitive components in the dark-luxury design system
aliases: [primitives, primitive index]
---

# Primitive Components

> [!abstract] Overview
> Primitives are the foundational layer of the Watchman design system. Built on raw Radix headless components and native HTML elements, each primitive is <150 LOC and fully typed. All primitives use OKLCH color tokens, Geist typography, and consistent motion.

> [!info] Phase 2 Shipped
> Phase 2 (design system + primitives) shipped on 2026-04-18. All 14 primitives are documented below with usage patterns and related links.

## Primitive Documentation

```dataview
TABLE WITHOUT ID file.link AS "Primitive", date AS "Date", type AS "Type"
FROM "docs/components/primitives"
WHERE type = "component" AND file.name != "index"
SORT file.name ASC
```

## Core Primitives

### UI Containers

| Primitive | Purpose | File |
|-----------|---------|------|
| [[docs/components/primitives/surface\|Surface]] | Elevated container with depth hierarchy | [[apps/frontend/src/components/primitives/Surface.tsx]] |
| [[docs/components/primitives/skeleton\|Skeleton]] | Loading placeholder with shimmer | [[apps/frontend/src/components/primitives/Skeleton.tsx]] |

### Interactive

| Primitive | Purpose | File |
|-----------|---------|------|
| [[docs/components/primitives/button\|Button]] | Action trigger with variants | [[apps/frontend/src/components/primitives/Button.tsx]] |
| [[docs/components/primitives/badge\|Badge]] | Status/tag indicator | [[apps/frontend/src/components/primitives/Badge.tsx]] |
| [[docs/components/primitives/toggle\|Toggle]] | Toggle button + group | [[apps/frontend/src/components/primitives/Toggle.tsx]] |

### Modal & Floating

| Primitive | Purpose | File |
|-----------|---------|------|
| [[docs/components/primitives/dialog\|Dialog]] | Modal dialog wrapper | [[apps/frontend/src/components/primitives/Dialog.tsx]] |
| [[docs/components/primitives/confirm-dialog\|ConfirmDialog]] | Styled confirmation dialog with destructive variant | [[apps/frontend/src/components/primitives/ConfirmDialog.tsx]] |
| [[docs/components/primitives/sheet\|Sheet]] | Slide-out drawer modal | [[apps/frontend/src/components/primitives/Sheet.tsx]] |
| [[docs/components/primitives/tooltip\|Tooltip]] | Floating tooltip label | [[apps/frontend/src/components/primitives/Tooltip.tsx]] |
| [[docs/components/primitives/popover\|Popover]] | Floating interactive panel | [[apps/frontend/src/components/primitives/Popover.tsx]] |

### Navigation

| Primitive | Purpose | File |
|-----------|---------|------|
| [[docs/components/primitives/tabs\|Tabs]] | Tab navigation container | [[apps/frontend/src/components/primitives/Tabs.tsx]] |
| [[docs/components/primitives/scroll-area\|ScrollArea]] | Custom scrollbar container | [[apps/frontend/src/components/primitives/ScrollArea.tsx]] |

### Data Display

| Primitive | Purpose | File |
|-----------|---------|------|
| [[docs/components/primitives/status-dot\|StatusDot]] | Colored status indicator dot | [[apps/frontend/src/components/primitives/StatusDot.tsx]] |
| [[docs/components/primitives/metric-value\|MetricValue]] | Prominent metric display | [[apps/frontend/src/components/primitives/MetricValue.tsx]] |
| [[docs/components/primitives/delta\|Delta]] | Change/trend indicator (+/-/=) | [[apps/frontend/src/components/primitives/Delta.tsx]] |
| [[docs/components/primitives/sparkline\|Sparkline]] | Micro line chart (visx-based) | [[apps/frontend/src/components/primitives/Sparkline.tsx]] |

## Design System Foundation

All primitives are built on the design system defined in [[docs/architecture/frontend-design-system|Frontend Design System]]:

### Design Tokens

- **Colors**: OKLCH surfaces (0–3), text hierarchy (hi/md/lo/dim), accent (cold gold), status (ok/warn/crit)
- **Spacing**: 4px base grid (s-1 to s-12)
- **Typography**: Geist Variable sans + Geist Mono Variable, 8-point scale (fs-mono to fs-display)
- **Motion**: Cubic-Bézier easing (ease-out-q, ease-in-out-q), 3 durations (fast/med/slow)
- **Elevation**: 3-level shadow system (elev-1/2/3) with inset hairlines + diffuse drops
- **Radii**: 5-step scale plus pill (r-1 to r-pill)

### Typography

- **Sans**: Geist Variable (default, all weights 100–900)
- **Mono**: Geist Mono Variable (metrics, code, with tabular numerals)
- **Features**: tnum, ss01, zero for mono clarity

### Motion

- **Keyframes**: tile-enter, sheet-enter/exit, fade-in/out, skeleton
- **Easing**: ease-out-q (snappy object entry), ease-in-out-q (smooth transitions)
- **Durations**: fast (150ms), med (300ms), slow (500ms)
- **Reduced motion**: All animations collapse to 1ms when `prefers-reduced-motion: reduce`

## Primitive Layer Characteristics

| Aspect | Property |
|--------|----------|
| **Size** | <150 lines of code each |
| **Type safety** | Full TypeScript with interfaces/generics |
| **Dependencies** | Radix (some), native HTML (most), visx (Sparkline) |
| **Styling** | CVA (Class Variance Authority) + Tailwind utilities |
| **Accessibility** | Full ARIA labels, keyboard navigation, focus management |
| **Focus** | Focused, single-responsibility components |

## Tailwind Integration

All tokens are mapped to Tailwind utilities for convenient use:

```javascript
// Colors: bg-surface-1, text-text-hi, border-hairline, etc.
// Spacing: p-s-4, gap-s-2, mb-s-6, etc.
// Radius: rounded-r-2, rounded-r-pill, etc.
// Typography: font-sans, font-mono, text-fs-body, etc.
// Motion: duration-fast, ease-out-q, etc.
// Shadows: shadow-elev-1, shadow-elev-2, etc.
```

## Export

All primitives are exported from [[apps/frontend/src/components/primitives/index.ts]]:

```typescript
export { Button, type ButtonProps } from "./Button";
export { Surface, type SurfaceProps } from "./Surface";
export { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "./Dialog";
export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";
export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetBody, SheetFooter } from "./Sheet";
export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "./Tooltip";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";
export { Popover, PopoverTrigger, PopoverContent } from "./Popover";
export { Toggle, ToggleGroup } from "./Toggle";
export { Badge, type BadgeProps } from "./Badge";
export { Skeleton, type SkeletonProps } from "./Skeleton";
export { ScrollArea, ScrollBar } from "./ScrollArea";
export { StatusDot, type StatusDotProps } from "./StatusDot";
export { MetricValue, type MetricValueProps } from "./MetricValue";
export { Delta, type DeltaProps } from "./Delta";
export { Sparkline, type SparklineProps, type SparklineTone } from "./Sparkline";
```

## Demo Page

The `apps/frontend/src/pages/BentoDemo.tsx` (BentoDemo) page showcases all primitives with interactive examples. Gated by `?bento=1` query or reachable at `/bento` route.

## Phase Roadmap

- **Phase 1** ✓ (Complete): Backend time-series (DuckDB) + `/history` endpoint
- **Phase 2** ✓ (Complete): Design system (tokens, typography, motion) + primitives
- **Phase 3** (Planned): ServiceTile composite, DashboardGrid layout, tile renderers
- **Phase 4** (Planned): Dashboard migration to bento tiles
- **Phase 5** (Planned): Refinement, performance, additional composites
- **Phase 6** (Planned): Final ADR-014, legacy cleanup, shadcn removal

## Related

- [[docs/architecture/frontend-design-system|Frontend Design System]] — Tokens, typography, motion, elevation
- [[apps/frontend/src/styles/tokens.css|tokens.css]] — CSS token definitions
- [[apps/frontend/src/styles/fonts.css|fonts.css]] — Font imports
- [[apps/frontend/src/styles/motion.css|motion.css]] — Keyframes and motion
- [[docs/components/index|Components Index]] — All components
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] — Architectural decision
