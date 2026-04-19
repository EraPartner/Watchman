---
title: Surface Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, surface, container, dark-luxury]
description: Elevated container component with depth hierarchy and tone variants
aliases: [surface, Surface]
---

# Surface Primitive

Elevated container built on native `<div>` for creating visual hierarchy via surfaces, shadows, and tonal accents.

## Purpose

Render a visually distinct container with configurable elevation (shadow), tone (semantic color), and padding.

## Variants

### Elevation Variants

Elevation creates depth through inset hairlines and drop shadows:

| Level | Style | Usage |
|-------|-------|-------|
| `0` | `--surface-0` bg, no shadow | Flat, non-interactive backgrounds |
| `1` | `--surface-1` + `--elev-1` shadow | Default interactive surfaces |
| `2` | `--surface-1` + `--elev-2` shadow | Modal content, emphasized containers |
| `3` | `--surface-1` + `--elev-3` shadow | Highest overlay layer, top-level modal |

### Tone Variants

Semantic color accents via inset borders:

| Tone | Border | Usage |
|------|--------|-------|
| `neutral` | None (default) | Standard surfaces |
| `ok` | `1px solid --ok` | Success, healthy, valid state |
| `warn` | `1px solid --warn` | Warning, caution, potential issue |
| `crit` | `1px solid --crit` | Critical error, offline, failure |

### Padding Variants

Configurable inner spacing:

| Size | Padding | Usage |
|------|---------|-------|
| `none` | `0` | No internal padding (custom layout) |
| `sm` | `--s-3` (12px) | Compact sections |
| `md` | `--s-4` (16px) | Default padding, most containers |
| `lg` | `--s-6` (24px) | Spacious sections, feature cards |

## Props

```typescript
interface SurfaceProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfaceVariants> {}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `elevation` | `0 \| 1 \| 2 \| 3` | `1` | Shadow/depth level |
| `tone` | `'neutral' \| 'ok' \| 'warn' \| 'crit'` | `'neutral'` | Semantic color tone |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Internal spacing |
| `children` | `ReactNode` | — | Container content |
| `className` | `string` | — | Additional CSS classes |
| `...rest` | — | — | Standard div attributes |

## Usage

```typescript
import { Surface } from "@/components/primitives";

// Default (elevation 1, neutral tone, medium padding)
<Surface>
  <h2>Card Title</h2>
  <p>Card content</p>
</Surface>

// With elevation
<Surface elevation={0}>Flat background</Surface>
<Surface elevation={2}>Modal content</Surface>
<Surface elevation={3}>Top overlay</Surface>

// With tone
<Surface tone="ok">System healthy</Surface>
<Surface tone="warn">Check configuration</Surface>
<Surface tone="crit">Service offline</Surface>

// With padding
<Surface padding="sm">Compact</Surface>
<Surface padding="lg">Spacious</Surface>
<Surface padding="none">Custom layout</Surface>

// Combinations
<Surface elevation={2} tone="warn" padding="md">
  Important notice
</Surface>
```

## Styling Details

- **Background**: `--surface-1` by default (unless elevation 0)
- **Text color**: `--text-hi` on all surfaces
- **Radius**: `--r-3` (12px)
- **Border**: 1px inset for tone variants
- **Position**: `relative` (establishes stacking context)

## Elevation System

| Level | Inset Hairline | Drop Shadow |
|-------|---|---|
| 1 | `0 0 0 1px var(--hairline)` | `0 1px 3px rgba(0,0,0,0.2)` |
| 2 | `0 0 0 1px var(--hairline)` | `0 4px 12px rgba(0,0,0,0.3)` |
| 3 | `0 0 0 1px var(--hairline)` | `0 8px 24px rgba(0,0,0,0.4)` |

## Related

- [[docs/architecture/frontend-design-system|Design System]] — Elevation and color tokens
- [[docs/components/primitives/button|Button]] — Interactive surface
- [[docs/components/primitives/dialog|Dialog]] — Modal surface
- [[docs/components/primitives/sheet|Sheet]] — Drawer surface
- [[apps/frontend/src/components/primitives/Surface.tsx|Surface.tsx]]
