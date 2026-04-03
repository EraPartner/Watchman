---
title: "Hook: useToast"
type: component
status: active
date: 2026-04-02
tags: [hook, frontend, react, toast, notification, shadcn]
description: Toast notification system with reducer-based state management (shadcn/ui)
aliases: [use toast, toast hook, notification, toast notification]
---

# Hook: useToast

> [!abstract] Overview
> A toast notification system implementing a reducer-based state management pattern for displaying transient UI notifications. Part of the shadcn/ui component ecosystem.

## Purpose

Provides a global toast notification system with support for adding, updating, dismissing, and automatically removing toast messages. Uses a publish-subscribe pattern with a central reducer for state management.

## Exports

### `useToast()`

```typescript
const { toasts, toast, dismiss } = useToast();
```

| Property       | Type                                        | Description                            |
| -------------- | ------------------------------------------- | -------------------------------------- |
| `toasts`       | `ToasterToast[]`                            | Current list of active toasts          |
| `toast(props)` | `(props: Toast) => { id, dismiss, update }` | Create a new toast                     |
| `dismiss(id?)` | `(id?: string) => void`                     | Dismiss a specific toast or all toasts |

### `toast()` (standalone)

```typescript
import { toast } from "../hooks/use-toast";

toast({
  title: "Success",
  description: "Operation completed",
});
```

## Configuration

| Constant             | Value     | Description                           |
| -------------------- | --------- | ------------------------------------- |
| `TOAST_LIMIT`        | `1`       | Maximum number of simultaneous toasts |
| `TOAST_REMOVE_DELAY` | `1000000` | Delay before auto-removal (ms)        |

## Toast Shape

```typescript
type ToasterToast = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
```

## Actions

| Action          | Description                                |
| --------------- | ------------------------------------------ |
| `ADD_TOAST`     | Add a new toast (respects `TOAST_LIMIT`)   |
| `UPDATE_TOAST`  | Update an existing toast by ID             |
| `DISMISS_TOAST` | Close a toast (triggers auto-remove timer) |
| `REMOVE_TOAST`  | Remove a toast from state                  |

## Behavior

- Toasts are limited to `TOAST_LIMIT` (1) simultaneous displays
- Dismissing a toast starts an auto-remove timer
- Uses a global `listeners` array for pub-sub state updates
- Toast IDs are generated from a monotonically increasing counter

## Usage Example

```tsx
import { useToast } from "../hooks/use-toast";

function MyComponent() {
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      toast({ title: "Saved", description: "Changes saved successfully" });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    }
  };
}
```

## Dependencies

- `@/components/ui/toast` — `ToastActionElement`, `ToastProps` types

## Source

- [[apps/frontend/src/hooks/use-toast.ts]]

## Related

- [[docs/components/index|Components Index]]
- [[apps/frontend/src/components/ui/toast.tsx|Toast UI Component]]
- [[apps/frontend/src/components/ui/toaster.tsx|Toaster Component]]
