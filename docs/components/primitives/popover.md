---
title: Popover Primitive
type: component
status: active
date: 2026-06-13
tags: [primitive, popover, floating, interactive, radix, glass, liquid-glass]
description: Floating popover/panel wrapper around Radix Popover. PopoverContent uses glass-thick frosted material (ADR-028), including the profile-switcher dropdown.
aliases: [popover, Popover]
---

# Popover Primitive

Interactive floating panel built on [[https://www.radix-ui.com/docs/primitives/components/popover|Radix Popover]] for menus, settings, or rich content.

## Purpose

Display interactive content in a floating panel anchored to a trigger element, with positioning and focus management.

## Components

| Component        | Element   | Purpose                             |
| ---------------- | --------- | ----------------------------------- |
| `Popover`        | `Root`    | Container, manages open/close state |
| `PopoverTrigger` | `Trigger` | Opens popover on click              |
| `PopoverContent` | `Content` | Floating panel with arrow           |

## Props

```typescript
interface PopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

interface PopoverTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

interface PopoverContentProps extends HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  align?: "start" | "center" | "end";
  alignOffset?: number;
  children: ReactNode;
}
```

## Usage

```typescript
import { Popover, PopoverTrigger, PopoverContent } from "@/components/primitives";

<Popover>
  <PopoverTrigger>Settings</PopoverTrigger>
  <PopoverContent>
    <div className="space-y-s-2">
      <label>
        <input type="checkbox" /> Option 1
      </label>
      <label>
        <input type="checkbox" /> Option 2
      </label>
    </div>
  </PopoverContent>
</Popover>

// With positioning
<Popover>
  <PopoverTrigger>Filter</PopoverTrigger>
  <PopoverContent side="bottom" align="start">
    Filter options here
  </PopoverContent>
</Popover>
```

## Styling Details

- **Content**: `glass-thick` frosted material (ADR-028) — replaces the previous `--surface-2` opaque background. Applies to all `PopoverContent` panels including the profile-switcher dropdown. Translucent gradient + inset specular highlight + `backdrop-filter: blur(24px) saturate(180%)`. Falls back to near-opaque surface under `prefers-reduced-transparency` or when `backdrop-filter` is unsupported.
- **Text**: `--text-hi`
- **Padding**: `--s-4` (16px)
- **Radius**: `--r-3` (12px)
- **Shadow**: `--elev-2` for depth
- **Arrow**: Matches surface color, positioned toward trigger
- **Max width**: 320px (reasonable content width)

## Positioning

- **Side**: `top` | `right` | `bottom` | `left` (auto-flip on viewport edge)
- **Align**: `start` | `center` | `end` (relative to trigger)
- **Offsets**: Customize distance from trigger

## Accessibility

- **Trigger**: Keyboard accessible, auto-focus content on open
- **ARIA**: `role="dialog"` on content
- **Dismiss**: Click outside, Escape key, click trigger again
- **Focus**: Trap within popover while open

## Related

- [[docs/components/primitives/tooltip|Tooltip]] — Non-interactive floating label
- [[docs/components/primitives/dialog|Dialog]] — Full-screen modal variant (`glass-thick`)
- [[apps/frontend/src/styles/glass.css|glass.css]] — Glass utility classes
- [[https://www.radix-ui.com/docs/primitives/components/popover|Radix Popover Docs]]
- [[apps/frontend/src/components/primitives/Popover.tsx|Popover.tsx]]
- [[docs/adr/028-liquid-glass-observability-tiles|ADR-028]] — `glass-thick` material on `PopoverContent`
