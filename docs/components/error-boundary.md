---
title: ErrorBoundary Component
type: component
status: active
date: 2026-04-02
tags: [component, frontend, react, error-handling, class-component]
description: React class component error boundary that catches rendering errors and displays a fallback UI with reset capability
aliases: [error boundary, error handler, fallback ui]
---

# ErrorBoundary

> [!abstract] Summary
> A React class component that catches JavaScript errors anywhere in its child component tree, logs them, and displays a fallback UI instead of crashing the entire application.

## Overview

`ErrorBoundary` implements React's error boundary pattern using `getDerivedStateFromError` and `componentDidCatch`. It provides a user-friendly error display with a "Try Again" reset button and shows detailed error information in development mode.

## File Location

`[[apps/frontend/src/components/ErrorBoundary.tsx]]`

## Props

| Prop       | Type                     | Description                                          |
| ---------- | ------------------------ | ---------------------------------------------------- |
| `children` | `ReactNode`              | Component tree to protect                            |
| `fallback` | `ReactNode \| undefined` | Custom fallback UI (overrides default error display) |

## Behavior

### Error Capture

- `getDerivedStateFromError` — Sets `hasError: true` and stores the error
- `componentDidCatch` — Logs error and component stack to console (production: send to error reporting service)

### Display States

**Normal**: Renders children normally.

**Error with custom fallback**: Renders the provided `fallback` prop.

**Error with default display**:

- Card with warning icon and "Something went wrong" title
- User-friendly error message
- **Development mode only**: Shows error message and component stack trace in a `<pre>` block
- "Try Again" button that resets the error state

### Reset

The `handleReset` method clears the error state, allowing the component tree to re-render. This is useful for transient errors.

## Usage

```tsx
import { ErrorBoundary } from "@/components/ErrorBoundary";

// With default error display
<ErrorBoundary>
  <Dashboard />
</ErrorBoundary>

// With custom fallback
<ErrorBoundary fallback={<CustomErrorUI />}>
  <Dashboard />
</ErrorBoundary>
```

## Design Decisions

- **Class component** — Error boundaries must be class components (React limitation)
- **Development error details** — Error details only shown in dev mode via `import.meta.env.MODE === "development"`
- **Reset capability** — Allows recovery from transient errors without page reload
- **Custom fallback support** — Consumers can provide their own error UI

## Related

- [[docs/components/auth-guard|AuthGuard]] — Another protective wrapper component
- [[docs/architecture/frontend-architecture|Frontend Architecture]] — Error handling strategy
