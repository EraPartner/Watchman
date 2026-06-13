---
title: StatusDot Primitive
type: component
status: active
date: 2026-06-13
tags: [primitive, status, indicator, dot, visual, a11y, color-blind, phase-0a]
description: Colored status indicator dot component with color-blind-friendly shapes and data-state attribute for accessibility
aliases: [status-dot, StatusDot]
---

# StatusDot Primitive

Small status indicator for inline status display with color-blind-friendly shape variants and semantic data attributes.

## Purpose

Render a colored dot to indicate status, health, or state without relying on color alone. Each tone (ok, warn, crit, neutral) uses a distinct shape to support color-blind users.

## Accessibility (Phase 0a — F3)

**Color-Blind Disambiguation**: StatusDot uses non-color visual cues (shapes) in addition to hue to ensure status is conveyed to all users:

- **ok**: Circle (🔵) — Normal operation
- **warn**: Diamond (◇) — Warning/caution state
- **crit**: Square (▢) — Critical/error state
- **neutral**: Rectangle/dash (▬) — Unknown/neutral

**Data Attribute**: Every StatusDot has a `data-state` attribute matching its tone, allowing CSS consumers and test suites to target specific states without relying on color alone.

```html
<span role="status" data-state="ok" class="..."><!-- ok circle --></span>
<span role="status" data-state="warn" class="..."><!-- warn diamond --></span>
<span role="status" data-state="crit" class="..."><!-- crit square --></span>
<span role="status" data-state="neutral" class="..."
  ><!-- neutral rectangle --></span
>
```

## Variants

| Tone      | Shape         | Color              | Usage                     |
| --------- | ------------- | ------------------ | ------------------------- |
| `ok`      | Circle (⚪)   | `--ok` (green)     | Online, healthy, success  |
| `warn`    | Diamond (◇)   | `--warn` (yellow)  | Warning, caution, pending |
| `crit`    | Square (▢)    | `--crit` (red)     | Critical, offline, error  |
| `neutral` | Rectangle (▬) | `--text-lo` (gray) | Unknown, neutral, default |

### Two-tier dot tone in ServiceTile

`ServiceTile` renders two `StatusDot` components side-by-side when both `host` and `service` health tiers are present. The tone assigned to a **down** tier depends on overall service reachability:

- `crit` (red square) — the whole service is offline (`reachable = false`)
- `warn` (amber diamond) — the service is reachable overall but this individual tier is down

This prevents a red square from appearing on services that are genuinely online but have one non-responsive tier (e.g. a NAS blocking ICMP while SNMP answers, or a router with no TCP port probe configured). See [[docs/components/service-tile|ServiceTile]] and [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]].

## Props

```typescript
interface StatusDotProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof dotVariants> {
  tone?: "ok" | "warn" | "crit" | "neutral"; // Defaults to 'ok'
  size?: "sm" | "md" | "lg"; // Defaults to 'md'
  pulse?: boolean; // Pulse animation, defaults to false
  label?: string; // aria-label text
}
```

## Usage

```typescript
import { StatusDot } from "@/components/primitives";

// Static indicator with label
<div className="flex items-center gap-s-2">
  <StatusDot tone="ok" label="System online" />
  <span>System Online</span>
</div>

// Animated (pulsing) warning state
<div className="flex items-center gap-s-2">
  <StatusDot tone="warn" pulse label="Updating in progress" />
  <span>Updating...</span>
</div>

// With conditional tone
<Surface className="flex items-center justify-between">
  <span>Service Status</span>
  <StatusDot tone={isOnline ? 'ok' : 'crit'} label={isOnline ? 'Running' : 'Down'} />
</Surface>

// Different sizes
<div className="flex gap-s-4">
  <StatusDot tone="ok" size="sm" />
  <StatusDot tone="ok" size="md" />
  <StatusDot tone="ok" size="lg" />
</div>

// Testing with data-state
// CSS: [data-state="crit"] { outline: 1px solid red; }
// Test: expect(el.getAttribute("data-state")).toBe("crit");
```

## Styling Details

### Shape Encoding

Shapes are implemented via CVA (Class Variance Authority) variants:

- **ok (circle)**: Base `rounded-full` style, no overrides
- **warn (diamond)**: `rounded-none` + `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`
- **crit (square)**: `rounded-[2px]` (tight corners via tailwind-merge override)
- **neutral (rectangle)**: `rounded-[1px] aspect-ratio: 2/1` (short dash)

### Base Styling

- **Ring**: 2px outer ring in `--surface-1` for subtle depth
- **Sizes**:
  - `sm`: 1.5 × 1.5 units (6px)
  - `md`: 2 × 2 units (8px, default)
  - `lg`: 2.5 × 2.5 units (10px)
- **Animation**: Ping animation when `pulse=true` (respects `prefers-reduced-motion`)
- **Accessibility**: ARIA `role="status"` + `aria-label` for semantic context

## Testing

StatusDot includes comprehensive tests for data-state behavior:

- [[apps/frontend/src/components/primitives/StatusDot.test.tsx]] covers:
  - data-state='ok' when tone='ok'
  - data-state='warn' when tone='warn'
  - data-state='crit' when tone='crit'
  - data-state='neutral' when tone='neutral'
  - data-state defaults to 'ok' when tone is omitted

## Related

- [[docs/features/service-monitoring|Service Monitoring]] — Two-tier status rendering using StatusDot
- [[docs/components/primitives/badge|Badge]] — Larger status indicator
- [[docs/components/primitives/metric-value|MetricValue]] — Metric with status
- [[docs/architecture/frontend-design-system|Frontend Design System]] — OKLCH tokens and typography
- [[apps/frontend/src/components/primitives/StatusDot.tsx|StatusDot.tsx]]
- [[apps/frontend/src/components/primitives/StatusDot.test.tsx|StatusDot.test.tsx]]
