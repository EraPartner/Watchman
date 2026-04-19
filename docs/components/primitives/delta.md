---
title: Delta Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, delta, change, trend, indicator]
description: Change/trend indicator showing +/- with semantic color
aliases: [delta, Delta]
---

# Delta Primitive

Display a change or trend indicator with semantic coloring (+/–/=).

## Purpose

Show the direction and magnitude of a change (increase, decrease, or no change) with appropriate styling.

## Props

```typescript
interface DeltaProps extends HTMLAttributes<HTMLSpanElement> {
  value: number; // Positive (up), negative (down), or zero
  decimals?: number; // Decimal places (default: 1)
  unit?: string; // Optional unit (e.g. "%", "ms")
  absolute?: boolean; // Show absolute value only (default: false)
}
```

## Rendering

| Value | Display | Icon | Color | Usage |
|-------|---------|------|-------|-------|
| > 0 | `+ 5.2%` | ↑ | `--ok` (green) | Positive trend |
| < 0 | `– 3.1%` | ↓ | `--crit` (red) | Negative trend |
| = 0 | `= 0.0%` | — | `--text-md` (gray) | No change |

## Usage

```typescript
import { Delta } from "@/components/primitives";

// Positive delta (increase)
<Delta value={5.2} unit="%" /> // Renders: ↑ +5.2%

// Negative delta (decrease)
<Delta value={-3.1} unit="ms" /> // Renders: ↓ −3.1ms

// No change
<Delta value={0} unit="%" /> // Renders: = 0.0%

// Absolute value (ignore sign)
<Delta value={-42} absolute unit="requests" /> // Renders: 42 requests

// In a metric
<div className="flex items-center gap-s-2">
  <MetricValue value="1,234" label="Requests" />
  <Delta value={8.5} unit="%" />
</div>

// Custom decimals
<Delta value={0.125} decimals={2} unit="ms" /> // Renders: +0.13ms
```

## Styling Details

- **Layout**: Inline flex, gap `--s-1` between icon and text
- **Icon**: Arrow up (↑), arrow down (↓), or dash (—)
- **Color**: Inherits from variant (ok/crit/neutral)
- **Typography**: `--font-mono`, `--fs-body`, weight 500
- **Tracking**: `--tracking-mono` (none)

## Related

- [[docs/components/primitives/metric-value|MetricValue]] — Main metric display
- [[docs/components/primitives/sparkline|Sparkline]] — Trend visualization
- [[docs/components/primitives/status-dot|StatusDot]] — Status indicator
- [[apps/frontend/src/components/primitives/Delta.tsx|Delta.tsx]]
