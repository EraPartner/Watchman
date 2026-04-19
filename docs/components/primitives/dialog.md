---
title: Dialog Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, dialog, modal, interactive, radix]
description: Accessible modal dialog wrapper around Radix Dialog
aliases: [dialog, Dialog]
---

# Dialog Primitive

Accessible modal dialog built on [[https://www.radix-ui.com/docs/primitives/components/dialog|Radix Dialog]].

## Purpose

Display modal content with overlay, focus trap, and escape key handling.

## Components

| Component | Element | Purpose |
|-----------|---------|---------|
| `Dialog` | `Root` | Container, manages open/close state |
| `DialogTrigger` | `Trigger` | Opens dialog on click |
| `DialogContent` | `Content` + overlay | Dialog box with backdrop |
| `DialogTitle` | `Title` | Semantic heading |
| `DialogDescription` | `Description` | Helper text (optional) |
| `DialogClose` | Custom close button | Closes dialog |

## Props

```typescript
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}
```

## Usage

```typescript
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/primitives";

<Dialog>
  <DialogTrigger>Open Dialog</DialogTrigger>
  <DialogContent>
    <DialogTitle>Confirm Action</DialogTitle>
    <DialogDescription>
      Are you sure? This cannot be undone.
    </DialogDescription>
    <div>
      <DialogClose>Cancel</DialogClose>
      <button>Confirm</button>
    </div>
  </DialogContent>
</Dialog>
```

## Styling Details

- **Overlay**: Backdrop blur with dark overlay
- **Content**: `--surface-2` background, `--elev-3` shadow
- **Animation**: Fade + scale via `sheet-enter` motion
- **Focus**: Auto-focus on title; trap within dialog
- **Escape**: Close on Escape key
- **Stacking**: Highest z-index (overlay system)

## Accessibility

- **ARIA**: `role="dialog"`, `aria-modal="true"` on content
- **Focus trap**: Focus cannot escape the dialog
- **Labeled**: Use `DialogTitle` for semantic heading
- **Escape key**: Close dialog (can be disabled)
- **Click outside**: Close on backdrop click (can be disabled via Radix config)

## Related

- [[docs/components/primitives/sheet|Sheet]] — Slide-out drawer variant
- [[docs/components/primitives/surface|Surface]] — Container with elevation
- [[https://www.radix-ui.com/docs/primitives/components/dialog|Radix Dialog Docs]]
- [[apps/frontend/src/components/primitives/Dialog.tsx|Dialog.tsx]]
