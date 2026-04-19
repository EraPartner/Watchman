---
title: Button Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, button, interactive, dark-luxury]
description: Interactive button component with ghost, tonal, and accent variants
aliases: [button, Button]
---

# Button Primitive

Interactive action trigger built on native `<button>` with OKLCH tokens and CVA variants.

## Purpose

Render a clickable button with consistent styling, sizing, and focus states across the application.

## Variants

### Color Variants

| Variant | Background | Text | Hover | Usage |
|---------|-----------|------|-------|-------|
| `ghost` | Transparent | `--text-md` | `--surface-2` bg + `--text-hi` text | Low-emphasis actions |
| `tonal` | `--surface-2` | `--text-hi` | `--surface-3` bg | Default, primary actions |
| `accent` | `--accent` | `--accent-contrast` | brightness 110% | Call-to-action, positive |

### Size Variants

| Size | Height | Padding | Font Size | Usage |
|------|--------|---------|-----------|-------|
| `sm` | `28px` (7) | `12px` (s-3) | `--fs-label` | Compact, secondary buttons |
| `md` | `36px` (9) | `16px` (s-4) | `--fs-body` | Default, most buttons |
| `lg` | `44px` (11) | `20px` (s-5) | `--fs-body` | Prominent, full-width |
| `icon` | `36px` (9) | `0` | — | Icon-only, square |

## Props

```typescript
interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'ghost' \| 'tonal' \| 'accent'` | `'tonal'` | Visual style variant |
| `size` | `'sm' \| 'md' \| 'lg' \| 'icon'` | `'md'` | Size variant |
| `children` | `ReactNode` | — | Button content |
| `disabled` | `boolean` | — | Disable interaction |
| `className` | `string` | — | Additional CSS classes |
| `...rest` | — | — | Standard button attributes (onClick, type, etc.) |

## Usage

```typescript
import { Button } from "@/components/primitives";

// Default (tonal, medium)
<Button>Save Changes</Button>

// Variants
<Button variant="ghost">Cancel</Button>
<Button variant="accent">Confirm</Button>

// Sizes
<Button size="sm">Compact</Button>
<Button size="lg">Large</Button>
<Button size="icon">×</Button>

// States
<Button disabled>Disabled</Button>
<Button onClick={() => console.log('clicked')}>With handler</Button>

// Custom type
<Button type="submit">Submit Form</Button>
```

## Styling Details

- **Focus ring**: 2px accent ring on focus-visible
- **Disabled**: 50% opacity + pointer-events-none
- **Transition**: Color transitions in `--dur-fast` with `--ease-out-q`
- **Gap**: `--s-2` (8px) between icon/text when both present
- **Font**: `font-sans`, weight 500 (label weight)
- **Radius**: `--r-2` (8px)

## Related

- [[docs/architecture/frontend-design-system|Design System]] — Token definitions
- [[docs/components/primitives/surface|Surface]] — Elevated container
- [[docs/components/primitives/badge|Badge]] — Status indicator
- [[apps/frontend/src/components/primitives/Button.tsx|Button.tsx]]
