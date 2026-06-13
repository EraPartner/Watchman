---
title: Dialog Primitive
type: component
status: active
date: 2026-06-13
tags: [primitive, dialog, modal, interactive, radix, glass, liquid-glass]
description: Accessible modal dialog wrapper around Radix Dialog. DialogContent uses glass-thick frosted material (ADR-028).
aliases: [dialog, Dialog]
---

# Dialog Primitive

Accessible modal dialog built on [[https://www.radix-ui.com/docs/primitives/components/dialog|Radix Dialog]].

## Purpose

Display modal content with overlay, focus trap, and escape key handling.

## Components

| Component           | Element             | Purpose                             |
| ------------------- | ------------------- | ----------------------------------- |
| `Dialog`            | `Root`              | Container, manages open/close state |
| `DialogTrigger`     | `Trigger`           | Opens dialog on click               |
| `DialogContent`     | `Content` + overlay | Dialog box with backdrop            |
| `DialogTitle`       | `Title`             | Semantic heading                    |
| `DialogDescription` | `Description`       | Helper text (optional)              |
| `DialogClose`       | Custom close button | Closes dialog                       |

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
- **Content**: `glass-thick` frosted material (ADR-028) — replaces the previous `--surface-2` opaque background. Translucent gradient + inset specular highlight + `backdrop-filter: blur(24px) saturate(180%)`. Falls back to near-opaque surface under `prefers-reduced-transparency` or when `backdrop-filter` is unsupported.
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

- [[docs/components/primitives/sheet|Sheet]] — Slide-out drawer variant (`glass-thick`)
- [[docs/components/primitives/surface|Surface]] — Container with elevation and `material="glass"` variant
- [[apps/frontend/src/styles/glass.css|glass.css]] — Glass utility classes
- [[https://www.radix-ui.com/docs/primitives/components/dialog|Radix Dialog Docs]]
- [[apps/frontend/src/components/primitives/Dialog.tsx|Dialog.tsx]]
- [[docs/adr/028-liquid-glass-observability-tiles|ADR-028]] — `glass-thick` material on `DialogContent`
