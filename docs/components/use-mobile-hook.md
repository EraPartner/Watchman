---
title: "Hook: useIsMobile"
type: component
status: active
date: 2026-04-02
tags: [hook, frontend, react, responsive, viewport]
description: React hook for detecting mobile viewport state using matchMedia
aliases: [use is mobile, mobile detection, responsive hook, viewport hook]
---

# Hook: useIsMobile

> [!abstract] Overview
> A React hook that detects whether the current viewport width is below the mobile breakpoint (768px) using the `matchMedia` API.

## Purpose

Provides a reactive boolean for conditional rendering of mobile-specific UI elements. Uses the browser's `matchMedia` API for efficient viewport detection without resize event listeners.

## Exports

### `useIsMobile()`

```typescript
const isMobile = useIsMobile();
```

| Property     | Type      | Description                        |
| ------------ | --------- | ---------------------------------- |
| Return value | `boolean` | `true` when viewport width < 768px |

## Behavior

- Uses `window.matchMedia("(max-width: 767px)")` for detection
- Listens for `change` events on the MediaQueryList
- Returns `true` when width is below `MOBILE_BREAKPOINT` (768px)
- Initial state is `undefined`, resolved on first effect run

## Configuration

| Constant            | Value | Description                                |
| ------------------- | ----- | ------------------------------------------ |
| `MOBILE_BREAKPOINT` | `768` | Pixel width threshold for mobile detection |

## Usage Example

```tsx
import { useIsMobile } from "../hooks/use-mobile";

function ResponsiveLayout() {
  const isMobile = useIsMobile();

  return (
    <div className={isMobile ? "flex-col" : "flex-row"}>
      {isMobile ? <MobileNav /> : <DesktopSidebar />}
    </div>
  );
}
```

## Dependencies

None (uses only React and browser APIs).

## Source

- [[apps/frontend/src/hooks/use-mobile.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
