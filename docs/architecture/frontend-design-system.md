---
title: Frontend Design System (Phase 2)
type: architecture
status: active
date: 2026-04-18
tags: [design-system, frontend, tokens, typography, motion, dark-luxury, bento, primitives]
description: Dark-luxury bento design system with OKLCH tokens, Geist typography, and motion foundations
aliases: [design system, dark luxury, bento, tokens, primitives]
---

# Frontend Design System (Phase 2)

> [!abstract] Overview
> Watchman's Phase 2 introduces a cohesive dark-luxury design system built on OKLCH color space, Geist Variable fonts, and a primitive component layer. The system prioritizes depth, hierarchy, and motion while maintaining consistency across all surfaces.

> [!info] Phase 2 Status
> Phase 2 (design system + primitives) shipped on 2026-04-18. Phase 1 (backend time-series) was completed earlier. See [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] for architectural context.

## Design Tokens

All tokens are defined in [[apps/frontend/src/styles/tokens.css]] using CSS custom properties (variables). The tokens cover color, spacing, typography, motion, and elevation.

### Color Palette

#### Surfaces (Dark-Luxury Depth Ladder)

Four-level surface hierarchy (0 = darkest, 3 = lightest) with OKLCH colorspace for perceptual consistency:

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-0` | `oklch(14% 0.008 270)` | Absolute background |
| `--surface-1` | `oklch(17% 0.01 270)` | Default surface elevation |
| `--surface-2` | `oklch(20% 0.012 270)` | Hover/active states, nested containers |
| `--surface-3` | `oklch(24% 0.014 270)` | Deepest interactive layers |

#### Hairline & Dividers

Subtle borders for visual separation without harsh contrast:

| Token | Value | Usage |
|-------|-------|-------|
| `--hairline` | `oklch(30% 0.01 270 / 0.5)` | Default borders, dividers (50% alpha) |
| `--hairline-strong` | `oklch(42% 0.015 270 / 0.7)` | Emphasized borders (70% alpha) |

#### Text Hierarchy

Four-tier text scale from highest to lowest emphasis:

| Token | Value | Usage |
|-------|-------|-------|
| `--text-hi` | `oklch(96% 0.005 90)` | Primary text, headlines |
| `--text-md` | `oklch(78% 0.01 90)` | Body text, default labels |
| `--text-lo` | `oklch(56% 0.012 90)` | Secondary text, captions |
| `--text-dim` | `oklch(42% 0.01 90)` | Disabled, placeholder text |

#### Accent (Cold Gold)

A warm, sophisticated accent color for interactive elements and highlights:

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `oklch(80% 0.13 85)` | Primary accent, buttons, highlights |
| `--accent-soft` | `oklch(70% 0.11 85 / 0.18)` | Soft backgrounds, hover states (18% alpha) |
| `--accent-contrast` | `oklch(18% 0.02 85)` | Text on accent backgrounds |

#### Status Colors

Semantic status indicators with soft and saturated variants:

| Status | Main Value | Soft Variant | Usage |
|--------|-----------|--------------|-------|
| **OK** | `oklch(72% 0.13 155)` | `oklch(68% 0.12 155 / 0.16)` | Success, healthy state |
| **Warn** | `oklch(78% 0.15 78)` | `oklch(72% 0.13 78 / 0.16)` | Warning, caution state |
| **Crit** | `oklch(66% 0.21 22)` | `oklch(60% 0.19 22 / 0.18)` | Critical error, offline |

### Spacing

4px base grid with 12-step scale (powers of ~1.2x):

| Token | Value | Usage |
|-------|-------|-------|
| `--s-1` | `4px` | Minimal gaps, internal component spacing |
| `--s-2` | `8px` | Small gaps between elements |
| `--s-3` | `12px` | Standard gaps, padding |
| `--s-4` | `16px` | Medium sections, component padding |
| `--s-5` | `20px` | Larger sections |
| `--s-6` | `24px` | Section padding |
| `--s-8` | `32px` | Major sections |
| `--s-10` | `40px` | Large containers |
| `--s-12` | `48px` | Viewport-scale spacing |

### Border Radii

Five-step radius scale plus a pill variant:

| Token | Value | Usage |
|-------|-------|-------|
| `--r-1` | `4px` | Minimal rounding on buttons, small UI |
| `--r-2` | `8px` | Standard rounding (default for most components) |
| `--r-3` | `12px` | Medium rounding, surfaces |
| `--r-4` | `16px` | Large rounding, prominent containers |
| `--r-pill` | `999px` | Fully rounded for badge-like shapes |

### Typography

#### Font Families

Both families are self-hosted from `node_modules/geist/dist/fonts/` with full weight range (100–900) and `font-display: swap`:

| Token | Value | Usage |
|-------|-------|-------|
| `--font-sans` | `'Geist Variable'` | Body text, UI labels, primary typeface |
| `--font-mono` | `'Geist Mono Variable'` (tabular-nums, tnum, ss01, zero) | Metrics, timestamps, code |

#### Font Sizes

Eight-point typography scale from mono to display:

| Token | Value | Usage |
|-------|-------|-------|
| `--fs-mono` | `12px` | Small labels, UI monospace |
| `--fs-label` | `11px` | Uppercase section labels |
| `--fs-body` | `14px` | Default body text |
| `--fs-h3` | `16px` | Tertiary headings |
| `--fs-h2` | `20px` | Secondary headings |
| `--fs-h1` | `28px` | Primary headings |
| `--fs-display` | `40px` | Hero/display text |

#### Font Weights

Five semantic weights:

| Token | Value | Usage |
|-------|-------|-------|
| `--fw-dim` | `300` | Reduced emphasis, light text |
| `--fw-body` | `400` | Default body weight |
| `--fw-label` | `500` | Labels, subtle emphasis |
| `--fw-title` | `600` | Headings, strong emphasis |
| `--fw-metric` | `700` | Metrics, badges, bold emphasis |

#### Line Heights

Three semantic line heights:

| Token | Value | Usage |
|-------|-------|-------|
| `--lh-tight` | `1.1` | Compact headlines |
| `--lh-snug` | `1.25` | Short-form text |
| `--lh-body` | `1.5` | Body paragraphs, UI text |

#### Letter Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--tracking-tight` | `-0.01em` | Tight headlines |
| `--tracking-label` | `0.06em` | Uppercase labels |
| `--tracking-mono` | `0` | Monospace (no tracking) |

### Motion

#### Easing Functions

Cubic Bézier curves optimized for UI motion:

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-out-q` | `cubic-bezier(0.16, 1, 0.3, 1)` | Object enter/appear (snappy, anticipatory) |
| `--ease-in-out-q` | `cubic-bezier(0.4, 0, 0.2, 1)` | Transitions between states (smooth balance) |

#### Duration

Three semantic timing scales:

| Token | Value | Usage |
|-------|-------|-------|
| `--dur-fast` | `150ms` | Quick feedback (hover, focus) |
| `--dur-med` | `300ms` | Standard transitions |
| `--dur-slow` | `500ms` | Longer reveals, enter animations |

#### Reduced Motion

When `prefers-reduced-motion: reduce` is set:

- All animation durations collapse to `1ms` (instant rendering)
- Motion effects are effectively disabled
- See [[apps/frontend/src/styles/motion.css]] for implementation

### Elevation (Shadows)

Three-level shadow system using inset hairlines + diffuse drop shadows:

| Token | Inset | Drop Shadow | Usage |
|-------|-------|------------|-------|
| `--elev-1` | Hairline at 0,0,0,1px | `0 1px 3px rgba(0,0,0,0.2)` | Subtle lift, default interactive |
| `--elev-2` | Hairline at 0,0,0,1px | `0 4px 12px rgba(0,0,0,0.3)` | Modal, sheet elevation |
| `--elev-3` | Hairline at 0,0,0,1px | `0 8px 24px rgba(0,0,0,0.4)` | Highest modal layer, overlay |

## Typography System

All fonts are self-hosted via [[apps/frontend/src/styles/fonts.css]]:

```css
@font-face {
  font-family: 'Geist Variable';
  src: url('/fonts/geist-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: 'Geist Mono Variable';
  src: url('/fonts/geist-mono-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-feature-settings: 'tnum', 'ss01', 'zero';
  font-display: swap;
}
```

The Geist Mono variant enables:
- `tnum` (tabular numerals) — fixed-width digits for metric alignment
- `ss01` — stylistic variant (context-specific)
- `zero` — dotted zero for clarity

## Motion System

Motion foundations are defined in [[apps/frontend/src/styles/motion.css]]:

### Keyframes

| Keyframe | Duration | Effect |
|----------|----------|--------|
| `@keyframes tile-enter` | Staggered 20ms per nth-child (up to 16) | Tiles cascade in on entry |
| `@keyframes sheet-enter` | 300ms | Modal sheet slides/fades in |
| `@keyframes sheet-exit` | 200ms | Modal sheet slides/fades out |
| `@keyframes fade-in` | Configurable | Opacity 0 → 1 |
| `@keyframes fade-out` | Configurable | Opacity 1 → 0 |
| `@keyframes skeleton` | 1.2s infinite | Skeleton loader shimmer |

### Utility Classes

Utility classes are auto-generated for tile entry stagger:

```css
.animate-tile-enter-0 { animation: tile-enter 400ms var(--ease-out-q) 0ms; }
.animate-tile-enter-1 { animation: tile-enter 400ms var(--ease-out-q) 20ms; }
/* ... up to 15 */
```

When `prefers-reduced-motion: reduce` is active, all durations collapse to `1ms`.

### Compositor-Friendly Properties

Only animate properties that run on the compositor (GPU):

- `transform` (translate, scale, rotate)
- `opacity`
- `clip-path`
- `filter` (sparingly)

Avoid animating layout-bound properties (`width`, `height`, `margin`, `padding`, `top`, `left`, `font-size`).

## Primitive Layer

The primitive layer sits between raw Radix headless components and the application. Each primitive is <150 LOC and fully typed.

### Core Primitives

| Primitive | Purpose | Based On |
|-----------|---------|----------|
| [[docs/components/primitives/button\|Button]] | Interactive action trigger | Native `<button>` |
| [[docs/components/primitives/surface\|Surface]] | Elevated container | Native `<div>` |
| [[docs/components/primitives/badge\|Badge]] | Status/tag indicator | Native `<span>` |
| [[docs/components/primitives/skeleton\|Skeleton]] | Loading placeholder | Native `<div>` |

### Interactive Primitives

| Primitive | Purpose | Based On |
|-----------|---------|----------|
| [[docs/components/primitives/dialog\|Dialog]] | Modal dialog | Radix Dialog |
| [[docs/components/primitives/sheet\|Sheet]] | Slide-out drawer | Custom modal variant |
| [[docs/components/primitives/tooltip\|Tooltip]] | Floating tooltip | Radix Tooltip |
| [[docs/components/primitives/tabs\|Tabs]] | Tab container | Radix Tabs |
| [[docs/components/primitives/popover\|Popover]] | Floating panel | Radix Popover |
| [[docs/components/primitives/toggle\|Toggle]] | Toggle button | Radix Toggle |
| [[docs/components/primitives/scroll-area\|ScrollArea]] | Custom scroll container | Radix Scroll Area |

### Data Display Primitives

| Primitive | Purpose | Basis |
|-----------|---------|-------|
| [[docs/components/primitives/metric-value\|MetricValue]] | Highlighted metric/stat | Typography + spacing |
| [[docs/components/primitives/delta\|Delta]] | Change indicator (+/-/= with color) | Typography |
| [[docs/components/primitives/status-dot\|StatusDot]] | Colored status indicator | Native `<div>` |
| [[docs/components/primitives/sparkline\|Sparkline]] | Micro chart (via visx) | visx line chart |

### Export

All primitives are exported from [[apps/frontend/src/components/primitives/index.ts]]:

```typescript
export { Button, type ButtonProps } from "./Button";
export { Surface, type SurfaceProps } from "./Surface";
// ... 12 more
```

## Tailwind Integration

The Tailwind config (`[[apps/frontend/tailwind.config.ts]]`) extends `theme.extend` to map all CSS tokens to utilities:

### Color Utilities

```javascript
colors: {
  surface: {
    0: 'var(--surface-0)',
    1: 'var(--surface-1)',
    2: 'var(--surface-2)',
    3: 'var(--surface-3)',
  },
  hairline: 'var(--hairline)',
  text: {
    hi: 'var(--text-hi)',
    md: 'var(--text-md)',
    lo: 'var(--text-lo)',
    dim: 'var(--text-dim)',
  },
  // ... status colors
}
```

Usage: `bg-surface-1`, `text-text-hi`, `border-hairline`, etc.

### Spacing Utilities

```javascript
spacing: {
  's-1': 'var(--s-1)',
  's-2': 'var(--s-2)',
  // ... up to s-12
}
```

Usage: `p-s-4`, `gap-s-3`, `mb-s-6`, etc.

### Radius Utilities

```javascript
borderRadius: {
  'r-1': 'var(--r-1)',
  'r-2': 'var(--r-2)',
  // ... r-pill
}
```

Usage: `rounded-r-2`, `rounded-r-pill`, etc.

### Typography Utilities

```javascript
fontFamily: {
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
},
fontSize: {
  'fs-mono': 'var(--fs-mono)',
  'fs-body': 'var(--fs-body)',
  // ... up to fs-display
}
```

### Motion Utilities

```javascript
transitionTimingFunction: {
  'out-q': 'var(--ease-out-q)',
  'in-out-q': 'var(--ease-in-out-q)',
},
transitionDuration: {
  'fast': 'var(--dur-fast)',
  'med': 'var(--dur-med)',
  'slow': 'var(--dur-slow)',
}
```

Usage: `transition-colors duration-fast ease-out-q`

### Shadow Utilities

```javascript
boxShadow: {
  'elev-1': 'var(--elev-1)',
  'elev-2': 'var(--elev-2)',
  'elev-3': 'var(--elev-3)',
}
```

Usage: `shadow-elev-1`

## Demo Page

The [[apps/frontend/src/pages/BentoDemo.tsx|BentoDemo]] page showcases all primitives and tokens. It's gated by the `?bento=1` query parameter or reachable at `/bento` route.

Sections include:
- Buttons (ghost, tonal, accent sizes: sm, md, lg, icon)
- Surfaces (elevations 0–3, tones: neutral/warn/crit/ok, padding variants)
- Status indicators (StatusDot variants, Badge variants)
- Metrics (MetricValue, Delta, Sparkline)
- Interaction (Dialog, Sheet, Tabs, Popover, Tooltip)
- Loading (Skeleton animations)
- Data display (ScrollArea, badge states)

## Related

- [[apps/frontend/src/styles/tokens.css|tokens.css]] — CSS token definitions
- [[apps/frontend/src/styles/fonts.css|fonts.css]] — Font imports
- [[apps/frontend/src/styles/motion.css|motion.css]] — Keyframes and motion utilities
- [[apps/frontend/tailwind.config.ts|tailwind.config.ts]] — Tailwind extensions
- [[docs/components/index|Components Index]] — All component docs
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] — Architectural decision context
