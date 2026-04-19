---
title: Badge Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, badge, indicator, status, dark-luxury]
description: Compact status or tag indicator component
aliases: [badge, Badge]
---

# Badge Primitive

Compact indicator for status tags, labels, and small accent content.

## Purpose

Display a small, visually distinct badge for status, category, or count indicators.

## Variants

| Variant | Background | Text | Usage |
|---------|-----------|------|-------|
| `default` | `--surface-2` | `--text-hi` | Generic badge, neutral |
| `outline` | Transparent | `--accent` | Secondary, outline style |
| `ok` | `--ok-soft` | `--ok` | Success, online, healthy |
| `warn` | `--warn-soft` | `--warn` | Warning, caution |
| `crit` | `--crit-soft` | `--crit` | Critical, offline, error |

## Props

```typescript
interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'outline' \| 'ok' \| 'warn' \| 'crit'` | `'default'` | Color variant |
| `children` | `ReactNode` | — | Badge content (text/count) |
| `className` | `string` | — | Additional CSS classes |

## Usage

```typescript
import { Badge } from "@/components/primitives";

<Badge>New</Badge>
<Badge variant="ok">Online</Badge>
<Badge variant="warn">Updating</Badge>
<Badge variant="crit">Offline</Badge>
<Badge variant="outline">Tag</Badge>
```

## Styling Details

- **Padding**: `--s-2` horizontal, `--s-1` vertical
- **Font**: `--fs-label` (11px), weight 500
- **Radius**: `--r-pill` (fully rounded)
- **Uppercase**: Text transform enabled
- **Letter spacing**: `--tracking-label`

## Related

- [[docs/architecture/frontend-design-system|Design System]]
- [[docs/components/primitives/status-dot|StatusDot]] — Colored dot indicator
- [[apps/frontend/src/components/primitives/Badge.tsx|Badge.tsx]]
