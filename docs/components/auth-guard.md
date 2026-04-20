---
title: AuthGuard Component (DEPRECATED)
type: component
status: deprecated
date: 2026-04-19
tags: [component, frontend, react, auth, deprecated, v2.3]
description: DEPRECATED - Route protection wrapper removed in v2.3 when authentication was removed
aliases: [auth guard, route guard, protected route]
---

# AuthGuard (DEPRECATED)

> [!warning] DEPRECATED in v2.3
> This component was **removed** as of version 2.3. Watchman is now a single-user home-lab application with no authentication. See [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] for details.

## Removal Details

- **Removed**: v2.3 (commit 6abf46b)
- **File**: `apps/frontend/src/components/AuthGuard.tsx` (deleted)
- **Reason**: Watchman is single-user; no route protection needed

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

## Test Coverage

- `[[apps/frontend/src/components/AuthGuard.test.tsx]]` verifies loading, unauthenticated redirect, and authenticated render behavior.
- `[[apps/frontend/src/pages/Login.test.tsx]]` provides complementary flow coverage for redirect/login transitions.

## Related

- [[docs/components/error-boundary|ErrorBoundary]] — Another protective wrapper component
- `useAuth` — Authentication hook used by this component
- [[docs/security/authentication|Authentication]] — Auth system documentation
- `[[apps/frontend/src/hooks/useAuth.tsx]]` — Auth hook implementation
- `[[apps/frontend/src/App.tsx]]` — Route tree wrapped with `AuthProvider`
