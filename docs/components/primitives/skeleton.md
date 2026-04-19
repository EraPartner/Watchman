---
title: Skeleton Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, skeleton, loading, placeholder, animation]
description: Loading skeleton placeholder with shimmer animation
aliases: [skeleton, Skeleton]
---

# Skeleton Primitive

Loading placeholder component with animated shimmer effect for content skeletons.

## Purpose

Display a placeholder while content is loading, providing visual feedback that data is being fetched.

## Props

```typescript
interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  // All standard div attributes
}
```

## Usage

```typescript
import { Skeleton } from "@/components/primitives";

// Basic skeleton
<Skeleton className="h-12 w-full rounded-r-2" />

// Text skeleton lines
<div className="space-y-s-2">
  <Skeleton className="h-4 w-3/4" />
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-2/3" />
</div>

// Card skeleton
<Surface>
  <div className="space-y-s-3">
    <Skeleton className="h-6 w-1/2" /> {/* Title */}
    <div className="space-y-s-2">
      <Skeleton className="h-4 w-full" /> {/* Content line 1 */}
      <Skeleton className="h-4 w-5/6" /> {/* Content line 2 */}
    </div>
  </div>
</Surface>

// Avatar skeleton
<Skeleton className="h-10 w-10 rounded-r-pill" />
```

## Styling Details

- **Default**: `--surface-2` background
- **Animation**: `@keyframes skeleton` shimmer with 1.2s duration
- **Reduced motion**: Stops animation but maintains placeholder appearance
- **Radius**: Default `--r-2`, override via `className`
- **Width/Height**: Use Tailwind utilities (`w-full`, `h-4`, etc.)

## Animation

The skeleton animation is a shimmer effect that runs continuously:

```css
@keyframes skeleton {
  0% { background-position: 0; }
  100% { background-position: 200%; }
}
```

Respects `prefers-reduced-motion: reduce` (animation disabled, static background).

## Best Practices

1. **Match layout**: Skeleton shape should match final content
2. **Multiple lines**: Use multiple skeleton elements for multiline text
3. **Spacing**: Maintain spacing with `space-y-*` utilities
4. **Duration**: Assume typical API responses (300–500ms), don't show forever
5. **Fallback**: Always provide fallback content or error state

## Related

- [[docs/architecture/frontend-design-system|Design System]] — Motion and animation tokens
- [[apps/frontend/src/components/primitives/Skeleton.tsx|Skeleton.tsx]]
