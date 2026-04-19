---
title: Sheet Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, sheet, drawer, modal, interactive, radix]
description: Slide-out drawer/sheet modal variant on Radix Dialog
aliases: [sheet, Sheet]
---

# Sheet Primitive

Slide-out drawer modal built on [[https://www.radix-ui.com/docs/primitives/components/dialog|Radix Dialog]] with custom animations.

## Purpose

Display side-drawer or bottom-sheet content with slide-out animation and overlay.

## Components

| Component | Element | Purpose |
|-----------|---------|---------|
| `Sheet` | `Root` | Container, manages open/close state |
| `SheetTrigger` | `Trigger` | Opens sheet on click |
| `SheetContent` | `Content` + overlay | Sheet box with slide animation |
| `SheetHeader` | Semantic wrapper | Top section (title, close) |
| `SheetBody` | Semantic wrapper | Main content area |
| `SheetFooter` | Semantic wrapper | Bottom section (actions) |
| `SheetClose` | Custom close button | Closes sheet |

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
- **Content**: `--surface-2` background, `--elev-2` shadow
- **Focus**: Trap within sheet

## Accessibility

- **ARIA**: Same as Dialog
- **Focus trap**: Focus cannot escape the sheet
- **Escape key**: Close on Escape
- **Click outside**: Close on backdrop click
- **Labeled**: Use semantic headers

## Related

- [[docs/components/primitives/dialog|Dialog]] — Modal dialog variant
- [[docs/components/primitives/surface|Surface]] — Container
- [[https://www.radix-ui.com/docs/primitives/components/dialog|Radix Dialog Docs]]
- [[apps/frontend/src/components/primitives/Sheet.tsx|Sheet.tsx]]
