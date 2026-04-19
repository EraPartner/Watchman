---
title: Sparkline Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, sparkline, chart, visualization, visx]
description: Micro line chart for inline trend display
aliases: [sparkline, Sparkline]
---

# Sparkline Primitive

Inline micro-chart for displaying trends using [[https://visx.dev/|visx]] line chart.

## Purpose

Show a data series trend in a compact, inline chart without axes or labels.

## Props

```typescript
interface SparklineProps extends HTMLAttributes<HTMLDivElement> {
  data: ReadonlyArray<number>; // Data series
  tone?: 'neutral' | 'ok' | 'warn' | 'crit'; // Color variant
  height?: number; // Chart height (default: 48px)
  width?: number; // Chart width (default: 120px)
  animated?: boolean; // Animate on mount (default: true)
}

type SparklineTone = 'neutral' | 'ok' | 'warn' | 'crit';
```

## Tone Variants

| Tone | Color | Usage |
|------|-------|-------|
| `neutral` | `--accent` | Default, informational trend |
| `ok` | `--ok` | Positive trend, success |
| `warn` | `--warn` | Warning, caution trend |
| `crit` | `--crit` | Critical, negative trend |

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

// Animated
<Sparkline data={data} animated={true} />

// In a card
<Surface>
  <MetricValue value="1,234" label="Requests/min" tone="ok" />
  <Sparkline data={data} tone="ok" />
</Surface>
```

## Styling Details

- **Chart area**: Transparent background
- **Line**: `2px` stroke, color inherited from tone
- **Animation**: Stroke-dasharray animation on mount (if enabled)
- **Stroke cap**: Rounded for smoothness
- **Viewbox**: Auto-scales to data range

## Data Requirements

- **Array**: ReadonlyArray of numbers
- **Length**: Minimum 2 points (needs at least a line)
- **Values**: Any numeric range (auto-scaled to fit)
- **Null/undefined**: Avoid (use 0 if needed)

## Performance

- Uses visx for SVG rendering (efficient)
- No tooltips or interaction
- Suitable for real-time dashboards
- Re-renders only on data change

## Related

- [[docs/components/primitives/metric-value|MetricValue]] — Main metric with sparkline
- [[docs/components/primitives/delta|Delta]] — Change indicator
- [[https://visx.dev/|visx Documentation]]
- [[apps/frontend/src/components/primitives/Sparkline.tsx|Sparkline.tsx]]
