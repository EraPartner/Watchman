---
title: Tooltip Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, tooltip, floating, interactive, radix]
description: Floating tooltip wrapper around Radix Tooltip
aliases: [tooltip, Tooltip]
---

# Tooltip Primitive

Floating tooltip built on [[https://www.radix-ui.com/docs/primitives/components/tooltip|Radix Tooltip]] for helpful context or labels.

## Purpose

Display contextual help text on hover or focus without cluttering the main UI.

## Components

| Component | Element | Purpose |
|-----------|---------|---------|
| `TooltipProvider` | `Provider` | Context wrapper (use once at app root) |
| `Tooltip` | `Root` | Container, manages open/close state |
| `TooltipTrigger` | `Trigger` | Triggers tooltip on hover/focus |
| `TooltipContent` | `Content` | Floating tooltip box |

## Props

```typescript
interface TooltipProps {
  delayDuration?: number; // Default 400ms
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

interface TooltipTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

interface TooltipContentProps extends HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  children: ReactNode;
}
```

## Usage

```typescript
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/primitives";

// Wrap app root once
<TooltipProvider>
  <App />
</TooltipProvider>

// Use in components
<Tooltip>
  <TooltipTrigger>Hover me</TooltipTrigger>
  <TooltipContent>Helpful text</TooltipContent>
</Tooltip>

// With positioning
<Tooltip>
  <TooltipTrigger>?</TooltipTrigger>
  <TooltipContent side="bottom">
    Learn more about this setting
  </TooltipContent>
</Tooltip>
```

## Styling Details

- **Content**: `--surface-2` background, `--text-hi` text
- **Padding**: `--s-2` (8px)
- **Radius**: `--r-2` (8px)
- **Shadow**: `--elev-2` for depth
- **Arrow**: Matches surface color
- **Max width**: 240px (readable, not too wide)
- **Delay**: 400ms before showing (avoid flashiness)

## Accessibility

- **Trigger**: Keyboard accessible (Tab to focus, show on focus)
- **ARIA**: `role="tooltip"` on content
- **Labeled**: Trigger should be descriptive
- **Dismiss**: Hide on Escape, blur, or click outside

## Related

- [[docs/components/primitives/popover|Popover]] — Interactive floating panel
- [[https://www.radix-ui.com/docs/primitives/components/tooltip|Radix Tooltip Docs]]
- [[apps/frontend/src/components/primitives/Tooltip.tsx|Tooltip.tsx]]
