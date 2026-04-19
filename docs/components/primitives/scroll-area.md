---
title: ScrollArea Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, scroll, scrollarea, container, radix]
description: Custom scrollbar wrapper around Radix Scroll Area
aliases: [scroll-area, ScrollArea]
---

# ScrollArea Primitive

Custom scrollbar container built on [[https://www.radix-ui.com/docs/primitives/components/scroll-area|Radix Scroll Area]] for styled scrolling.

## Purpose

Provide a consistent, themed scrolling experience with custom scrollbars that match the design system.

## Components

| Component | Element | Purpose |
|-----------|---------|---------|
| `ScrollArea` | `Root` | Container with overflow |
| `ScrollBar` | `Scrollbar` | Custom scrollbar (vertical/horizontal) |

## Props

```typescript
interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

interface ScrollBarProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal';
}
```

## Usage

```typescript
import { ScrollArea, ScrollBar } from "@/components/primitives";

// Basic vertical scroll
<ScrollArea className="h-48 w-full border rounded-r-2">
  <div className="p-s-4">
    {/* Long content */}
    {items.map((item) => (
      <div key={item.id}>{item.name}</div>
    ))}
  </div>
  <ScrollBar orientation="vertical" />
</ScrollArea>

// Horizontal scroll
<ScrollArea className="w-full h-12">
  <div className="flex gap-s-2 p-s-2">
    {/* Wide content */}
  </div>
  <ScrollBar orientation="horizontal" />
</ScrollArea>

// Both directions
<ScrollArea className="h-96 w-full">
  <table>
    {/* Table content */}
  </table>
  <ScrollBar orientation="vertical" />
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

## Styling Details

- **Scrollbar thumb**: `--surface-2` background
- **Scrollbar track**: `--surface-1` or transparent
- **Hover**: Thumb lightens to `--surface-3`
- **Width**: 8px (vertical), 8px (horizontal)
- **Radius**: `--r-pill` (rounded thumb)
- **Transition**: Smooth opacity changes

## Accessibility

- **Keyboard**: Arrow keys scroll content
- **Mouse wheel**: Standard scroll behavior
- **ARIA**: `role="region"` with optional `aria-label`

## Related

- [[docs/components/primitives/surface|Surface]] — Container foundation
- [[https://www.radix-ui.com/docs/primitives/components/scroll-area|Radix Scroll Area Docs]]
- [[apps/frontend/src/components/primitives/ScrollArea.tsx|ScrollArea.tsx]]
