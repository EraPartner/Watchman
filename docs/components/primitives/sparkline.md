---
title: Sparkline Primitive
type: component
status: active
date: 2026-06-13
tags: [primitive, sparkline, chart, visualization, visx, glass, liquid-glass]
description: Micro line chart for inline trend display. Rewritten in ADR-028 with smooth midpoint curves, vertical headroom for constant series, and a stretch mode for full-bleed tile footers.
aliases: [sparkline, Sparkline]
---

# Sparkline Primitive

Inline micro-chart for displaying trends using [[https://visx.dev/|visx]] line chart.

## Purpose

Show a data series trend in a compact, inline chart without axes or labels.

> [!info] ADR-028 rewrite
> The Sparkline component was fully rewritten as part of the [[docs/adr/028-liquid-glass-observability-tiles|ADR-028]] liquid-glass + observability-card redesign. The `baseline` prop was removed; the `stretch` mode and smooth midpoint curves are new.

## Props

```typescript
interface SparklineProps extends HTMLAttributes<HTMLDivElement> {
  data: ReadonlyArray<number>; // Data series
  tone?: "neutral" | "ok" | "warn" | "crit"; // Color variant
  height?: number; // Chart height (default: 48px)
  width?: number; // Chart width (default: 120px)
  animated?: boolean; // Animate on mount (default: true)
  stretch?: boolean; // Full-bleed mode: fills 100% width/height of parent (default: false)
}

type SparklineTone = "neutral" | "ok" | "warn" | "crit";
```

> [!note] Removed prop
> The `baseline` prop was removed in ADR-028. It caused constant-series data to render as a solid filled rectangle. The new vertical-headroom approach handles this automatically.

## Tone Variants

| Tone      | Color      | Usage                        |
| --------- | ---------- | ---------------------------- |
| `neutral` | `--accent` | Default, informational trend |
| `ok`      | `--ok`     | Positive trend, success      |
| `warn`    | `--warn`   | Warning, caution trend       |
| `crit`    | `--crit`   | Critical, negative trend     |

## Rendering (ADR-028)

The rewritten renderer has three key properties:

1. **Smooth midpoint curves** — Each segment uses a cubic Bézier with midpoints as control handles, producing a fluid S-curve through the data rather than sharp angular joins.
2. **Vertical headroom** — The Y scale is padded so that a constant or near-constant series rests as a calm low line near the bottom of the chart area instead of a filled rectangle spanning the full height.
3. **`stretch` mode** — When `stretch={true}` the component fills `100%` of its container's width and height (no fixed pixel dimensions). This is the mode used by `ServiceTile` for full-bleed gradient area-chart footers. The SVG `viewBox` is computed from the actual rendered size via `ResizeObserver`.

## Usage

```typescript
import { Sparkline } from "@/components/primitives";

// Basic series
const data = [12, 14, 13, 18, 22, 19, 24, 28, 26, 31];

<Sparkline data={data} />

// With tone
<Sparkline data={data} tone="ok" />

// Custom size
<Sparkline data={data} width={200} height={60} />

// Full-bleed tile footer (stretch mode — used by ServiceTile)
<div className="absolute inset-x-0 bottom-0 h-16">
  <Sparkline data={data} tone="ok" stretch />
</div>

// Constant series — renders as a calm low line, not a rectangle
<Sparkline data={[1, 1, 1, 1, 1]} tone="ok" />

// In a card
<Surface material="glass">
  <MetricValue value="1,234" label="Requests/min" tone="ok" />
  <Sparkline data={data} tone="ok" />
</Surface>
```

## Styling Details

- **Chart area**: Transparent background with gradient fill below the line
- **Line**: `2px` stroke, color inherited from tone
- **Curve**: Smooth cubic Bézier midpoint interpolation (no sharp angles)
- **Vertical headroom**: Y domain expanded by a minimum padding factor so flat series read as a line, not a bar
- **Animation**: Stroke-dasharray animation on mount (if `animated={true}`)
- **Stroke cap**: Rounded for smoothness
- **Stretch mode**: `width: 100%; height: 100%` on the root `<div>`, SVG auto-scales via `viewBox`

## Data Requirements

- **Array**: ReadonlyArray of numbers
- **Length**: Minimum 2 points (needs at least a line)
- **Values**: Any numeric range (auto-scaled to fit, with vertical headroom)
- **Constant series**: Handled gracefully — renders as a low calm line
- **Null/undefined**: Avoid (use 0 if needed)

## Performance

- Uses visx for SVG rendering (efficient)
- `stretch` mode adds one `ResizeObserver` per instance; cleans up on unmount
- No tooltips or interaction
- Suitable for real-time dashboards
- Re-renders only on data change

## Related

- [[docs/components/primitives/metric-value|MetricValue]] — Main metric with sparkline
- [[docs/components/primitives/delta|Delta]] — Change indicator
- [[https://visx.dev/|visx Documentation]]
- [[apps/frontend/src/components/primitives/Sparkline.tsx|Sparkline.tsx]]
