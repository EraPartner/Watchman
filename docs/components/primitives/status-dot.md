---
title: StatusDot Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, status, indicator, dot, visual]
description: Colored status indicator dot component
aliases: [status-dot, StatusDot]
---

# StatusDot Primitive

Small circular status indicator for inline status display.

## Purpose

Render a colored dot to indicate status, health, or state without taking up much space.

## Variants

| Variant | Color | Usage |
|---------|-------|-------|
| `ok` | `--ok` (green) | Online, healthy, success |
| `warn` | `--warn` (yellow) | Warning, caution, pending |
| `crit` | `--crit` (red) | Critical, offline, error |
| `neutral` | `--text-md` (gray) | Unknown, neutral, default |

## Props

```typescript
interface StatusDotProps extends HTMLAttributes<HTMLDivElement> {
  variant: 'ok' | 'warn' | 'crit' | 'neutral';
  animated?: boolean; // Pulse animation
}
```

## Usage

```typescript
import { StatusDot } from "@/components/primitives";

// Static indicator
<div className="flex items-center gap-s-2">
  <StatusDot variant="ok" />
  <span>System Online</span>
</div>

// Animated (pulsing)
<div className="flex items-center gap-s-2">
  <StatusDot variant="warn" animated />
  <span>Updating...</span>
</div>

// With other UI
<Surface className="flex items-center justify-between">
  <span>Service Status</span>
  <StatusDot variant={isOnline ? 'ok' : 'crit'} />
</Surface>
```

## Styling Details

- **Size**: 8px diameter
- **Radius**: `--r-pill` (fully round)
- **Animation**: Subtle pulse when `animated=true`
- **Pulse duration**: 2s with ease-in-out
- **Pulse effect**: Scale 1 → 1.25 → 1

## Related

- [[docs/components/primitives/badge|Badge]] — Larger status indicator
- [[docs/components/primitives/metric-value|MetricValue]] — Metric with status
- [[apps/frontend/src/components/primitives/StatusDot.tsx|StatusDot.tsx]]
