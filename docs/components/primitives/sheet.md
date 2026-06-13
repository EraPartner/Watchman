---
title: Sheet Primitive
type: component
status: active
date: 2026-06-13
tags: [primitive, sheet, drawer, modal, interactive, radix, glass, liquid-glass]
description: Slide-out drawer/sheet modal variant on Radix Dialog. SheetContent uses glass-thick frosted material (ADR-028).
aliases: [sheet, Sheet]
---

# Sheet Primitive

Slide-out drawer modal built on [[https://www.radix-ui.com/docs/primitives/components/dialog|Radix Dialog]] with custom animations.

## Purpose

Display side-drawer or bottom-sheet content with slide-out animation and overlay.

## Components

| Component      | Element             | Purpose                             |
| -------------- | ------------------- | ----------------------------------- |
| `Sheet`        | `Root`              | Container, manages open/close state |
| `SheetTrigger` | `Trigger`           | Opens sheet on click                |
| `SheetContent` | `Content` + overlay | Sheet box with slide animation      |
| `SheetHeader`  | Semantic wrapper    | Top section (title, close)          |
| `SheetBody`    | Semantic wrapper    | Main content area                   |
| `SheetFooter`  | Semantic wrapper    | Bottom section (actions)            |
| `SheetClose`   | Custom close button | Closes sheet                        |

## Props

Similar to Dialog, with animation direction support.

## Usage

```typescript
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetClose,
} from "@/components/primitives";

<Sheet>
  <SheetTrigger>Open Menu</SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <h2>Menu</h2>
      <SheetClose>×</SheetClose>
    </SheetHeader>
    <SheetBody>
      <nav>Navigation links...</nav>
    </SheetBody>
    <SheetFooter>
      <button>Done</button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

## Styling Details

- **Position**: Side drawer (typically right) or bottom sheet
- **Animation**: Slide in/out via `sheet-enter`/`sheet-exit` keyframes
- **Duration**: 300ms enter, 200ms exit
- **Easing**: `--ease-out-q`
- **Overlay**: Backdrop blur with dark overlay
- **Content**: `glass-thick` frosted material (ADR-028) — replaces the previous `--surface-2` opaque background. Translucent gradient + inset specular highlight + `backdrop-filter: blur(24px) saturate(180%)`. Falls back to near-opaque surface under `prefers-reduced-transparency` or when `backdrop-filter` is unsupported.
- **Focus**: Trap within sheet

## Accessibility

- **ARIA**: Same as Dialog
- **Focus trap**: Focus cannot escape the sheet
- **Escape key**: Close on Escape
- **Click outside**: Close on backdrop click
- **Labeled**: Use semantic headers

## Related

- [[docs/components/primitives/dialog|Dialog]] — Modal dialog variant (`glass-thick`)
- [[docs/components/primitives/surface|Surface]] — Container with `material="glass"` variant
- [[apps/frontend/src/styles/glass.css|glass.css]] — Glass utility classes
- [[https://www.radix-ui.com/docs/primitives/components/dialog|Radix Dialog Docs]]
- [[apps/frontend/src/components/primitives/Sheet.tsx|Sheet.tsx]]
- [[docs/adr/028-liquid-glass-observability-tiles|ADR-028]] — `glass-thick` material on `SheetContent`
