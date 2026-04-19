---
title: MetricValue Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, metric, data-display, typography]
description: Prominent metric/statistic display component
aliases: [metric-value, MetricValue]
---

# MetricValue Primitive

Display a prominent numeric metric with optional label and styling.

## Purpose

Render a metric or statistic prominently, with typography hierarchy and optional context.

## Props

```typescript
interface MetricValueProps extends HTMLAttributes<HTMLDivElement> {
  value: string | number; // The main metric (e.g. "42", "$1,234.56")
  label?: string; // Optional context label
  unit?: string; // Optional unit (e.g. "ms", "MB")
  size?: 'sm' | 'md' | 'lg'; // Display size
  tone?: 'neutral' | 'ok' | 'warn' | 'crit'; // Color variant
}
```

## Variants

### Size Variants

| Size | Value Font | Label Font | Usage |
|------|-----------|-----------|-------|
| `sm` | `--fs-h3` (16px) | `--fs-label` (11px) | Compact cards |
| `md` | `--fs-h1` (28px) | `--fs-body` (14px) | Default display |
| `lg` | `--fs-display` (40px) | `--fs-h2` (20px) | Hero/highlight |

### Tone Variants

| Tone | Color | Usage |
|------|-------|-------|
| `neutral` | `--text-hi` | Default, neutral metric |
| `ok` | `--ok` | Success, positive trend |
| `warn` | `--warn` | Warning, caution metric |
| `crit` | `--crit` | Critical, negative value |

## Usage

```typescript
import { MetricValue } from "@/components/primitives";

// Basic metric
<MetricValue value="42" label="Total Services" />

// With unit
<MetricValue value="98.5" unit="%" label="Uptime" />

// Large hero metric
<MetricValue
  size="lg"
  value="1,234"
  label="Requests/min"
  tone="ok"
/>

// Critical metric
<MetricValue
  size="md"
  value="3"
  label="Errors"
  tone="crit"
/>

// In a grid
<div className="grid grid-cols-3 gap-s-4">
  <MetricValue value="42" label="Online" tone="ok" />
  <MetricValue value="2" label="Updating" tone="warn" />
  <MetricValue value="1" label="Offline" tone="crit" />
</div>
```

## Styling Details

- **Layout**: Column stack (value on top, label below)
- **Value**: Monospace font (`--font-mono`), weight 700 (metric)
- **Label**: Sans font, weight 400 (body)
- **Line height**: Tight (headlines)
- **Color**: Inherits tone color
- **Spacing**: `--s-1` between value and label

## Typography

- **Value**: `--fw-metric` (700), `--font-mono`, proportional sizing by variant
- **Label**: `--fw-body` (400), `--font-sans`, proportional sizing by variant
- **Line height**: `--lh-tight` (1.1)

## Related

- [[docs/components/primitives/delta|Delta]] — Change indicator
- [[docs/components/primitives/sparkline|Sparkline]] — Mini chart
- [[docs/components/primitives/status-dot|StatusDot]] — Status indicator
- [[apps/frontend/src/components/primitives/MetricValue.tsx|MetricValue.tsx]]
