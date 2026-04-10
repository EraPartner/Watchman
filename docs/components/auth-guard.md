---
title: AuthGuard Component
type: component
status: active
date: 2026-04-10
tags: [component, frontend, react, auth, route-protection]
description: Route protection wrapper that prevents dashboard rendering until authentication is confirmed, redirecting unauthenticated users to login
aliases: [auth guard, route guard, protected route]
---

# AuthGuard

> [!abstract] Summary
> A lightweight route protection component that prevents child components from mounting until authentication status is confirmed, redirecting unauthenticated users to the login page.

## Overview

`AuthGuard` wraps protected routes (primarily the dashboard) and uses `useAuth` from the shared auth context to check authentication status. It prevents the dashboard from rendering and starting API requests until the user is authenticated.

## File Location

`[[apps/frontend/src/components/AuthGuard.tsx]]`

## Props

| Prop       | Type        | Description              |
| ---------- | ----------- | ------------------------ |
| `children` | `ReactNode` | Protected component tree |

## Behavior

### Three States

1. **Loading** — While auth status is being determined:
   - Shows centered spinner with "Checking authentication..." text
   - Children are NOT mounted (prevents premature API calls)

2. **Unauthenticated** — When user is not logged in:
   - Redirects to `/login` using React Router's `<Navigate replace />`
   - `replace` prevents the user from navigating back to the protected route

3. **Authenticated** — When user is logged in:
   - Renders children normally
   - Dashboard mounts and begins API requests

## Key Design Principle

> **Children don't mount until authenticated.** This is critical because the dashboard starts making API requests on mount. Without this guard, unauthenticated requests would fail and waste resources.

## Usage

```tsx
import AuthGuard from "@/components/AuthGuard";

<Route
  path="/"
  element={
    <AuthGuard>
      <Index />
    </AuthGuard>
  }
/>;
```

## Related

- [[docs/components/error-boundary|ErrorBoundary]] — Another protective wrapper component
- `useAuth` — Authentication hook used by this component
- [[docs/security/authentication|Authentication]] — Auth system documentation
- `[[apps/frontend/src/hooks/useAuth.tsx]]` — Auth hook implementation
- `[[apps/frontend/src/App.tsx]]` — Route tree wrapped with `AuthProvider`
