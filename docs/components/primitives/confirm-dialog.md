---
title: ConfirmDialog Primitive
type: component
status: active
date: 2026-04-19
tags: [primitive, dialog, confirmation, modal, destructive, interactive, radix]
description: Styled confirmation wrapper around Dialog primitive with destructive variant support, async actions, and pending state
aliases: [ConfirmDialog, confirm dialog, confirmation]
---

# ConfirmDialog Primitive

> [!abstract] Overview
> `ConfirmDialog` is a reusable, accessible confirmation dialog built on the [[docs/components/primitives/dialog|Dialog]] primitive. It supports both controlled and uncontrolled pending states, destructive styling with `--crit` tokens, and async action handling.

## Location

`[[apps/frontend/src/components/primitives/ConfirmDialog.tsx]]`

Exported from `[[apps/frontend/src/components/primitives/index.ts]]`

## Purpose

Provide a consistent, styled confirmation UI for any action with:
- Semantic destructive variant for deletions
- Support for async/Promise-based actions
- Both controlled and uncontrolled pending state management
- Accessible, dismissible modal with focus trap
- Cancellable operations with optional custom labels

## Props

```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;    // Default: "Delete"
  cancelLabel?: string;     // Default: "Cancel"
  destructive?: boolean;    // Default: false; applies --crit styling
  pending?: boolean;        // Controlled pending state (optional)
  onConfirm: () => void | Promise<void>;
}
```

## Usage

### Basic Destructive Confirmation (Controlled Pending)

```typescript
import { ConfirmDialog } from "@/components/primitives";
import { useState } from "react";
import { useDeleteService } from "@/hooks/useServices";

export function ServiceDeleteButton({ service }) {
  const [open, setOpen] = useState(false);
  const deleteMut = useDeleteService();

  return (
    <>
      <button onClick={() => setOpen(true)}>Delete Service</button>
      
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete service?"
        description={`"${service.name}" will be permanently removed.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive={true}
        pending={deleteMut.isPending}
        onConfirm={async () => {
          await deleteMut.mutateAsync(service.id);
          setOpen(false);
        }}
      />
    </>
  );
}
```

### Non-Destructive Confirmation

```typescript
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Confirm action"
  description="This will export all service configurations."
  confirmLabel="Export"
  cancelLabel="Skip"
  destructive={false}
  onConfirm={async () => {
    await handleExport();
    setOpen(false);
  }}
/>
```

### Uncontrolled Pending State

```typescript
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Disable service?"
  confirmLabel="Disable"
  onConfirm={async () => {
    // Pending managed internally until Promise resolves
    await disableService();
    setOpen(false);
  }}
/>
```

## Styling Details

### Destructive Variant

When `destructive={true}`:
- Confirm button uses `--crit` (critical/danger) color token
- Typically red/crimson background
- Clear visual distinction from safe operations
- Respects theme (light/dark via OKLCH)

### Non-Destructive Variant

When `destructive={false}` (default):
- Confirm button uses standard interactive color (usually accent)
- Softer visual feedback for reversible or informational actions

### Dialog Structure

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogTitle>{title}</DialogTitle>
    {description && <DialogDescription>{description}</DialogDescription>}
    <div className="footer">
      <button onClick={() => onOpenChange(false)} disabled={pending}>
        {cancelLabel}
      </button>
      <button onClick={onConfirm} disabled={pending} variant={destructive ? "destructive" : "default"}>
        {pending ? <Spinner /> : confirmLabel}
      </button>
    </div>
  </DialogContent>
</Dialog>
```

- **Title**: Semantic `DialogTitle`
- **Description** (optional): Secondary text for context
- **Footer Buttons**: Cancel and Confirm with pending state disabled
- **Spinner**: Shown in confirm button during pending

## Pending State

### Controlled Pending (Recommended)

Pass `pending` prop to control the state externally (e.g., from a mutation):

```typescript
pending={deleteMut.isPending}
```

Button and cancel are disabled while pending. Mutation completion is caller's responsibility.

### Uncontrolled Pending (Simple Cases)

Omit `pending` prop. Dialog manages internal pending state while `onConfirm` Promise resolves:

```typescript
onConfirm={async () => {
  await slowOperation();  // Dialog is pending until this resolves
}}
```

Once the Promise settles, pending resets automatically.

## Keyboard & Accessibility

- **Escape**: Close dialog (unless pending)
- **Tab**: Focus between buttons; cancel and confirm
- **Enter** (focus on confirm): Trigger action
- **ARIA**: `role="dialog"`, `aria-modal="true"`, titled by `DialogTitle`
- **Focus Trap**: Focus cannot escape the dialog
- **Semantic**: Uses `DialogDescription` for screen reader context

## Animation

- **Backdrop Fade**: Overlay fades in
- **Scale + Fade**: Dialog content animates via `sheet-enter` keyframe
- **Reduced Motion**: Collapses to 1ms when `prefers-reduced-motion: reduce`

## Related

- [[docs/components/primitives/dialog|Dialog Primitive]] — Base modal wrapper
- [[docs/components/service-detail-sheet|ServiceDetailSheet]] — Uses ConfirmDialog for delete operations
- [[docs/components/index|Components Index]]
- [[apps/frontend/src/components/primitives/Dialog.tsx|Dialog.tsx]]
