---
title: useAuth Hook
type: component
status: active
date: 2026-04-10
tags: [hook, frontend, react, auth, authentication]
description: Authentication state management hook providing login, logout, and session checking via cookie-based backend auth
aliases: [auth hook, authentication hook, login hook]
---

# useAuth

> [!abstract] Summary
> A React context-backed hook that manages authentication state, providing login, logout, and session checking via the backend's cookie-based authentication endpoints.

## Overview

`useAuth` is the central authentication API for the Watchman frontend. It is backed by an `AuthProvider` context so auth bootstrap (`GET /api/auth/me`) runs once for the app tree and shared state is reused by all consumers.

## File Location

`[[apps/frontend/src/hooks/useAuth.tsx]]`

## State

| State     | Type                                                  | Description                             |
| --------- | ----------------------------------------------------- | --------------------------------------- |
| `user`    | `{ id?: string \| number, username: string } \| null` | Current authenticated user              |
| `loading` | `boolean`                                             | Whether auth operations are in progress |
| `error`   | `string \| null`                                      | Last error message                      |

## Return Value

```typescript
{
  user: { id?: string | number; username: string } | null;
  isAuthenticated: boolean;    // Derived: !!user
  loading: boolean;
  error: string | null;
  login: (username, password, remember?) => Promise<{ success, user?, error? }>;
  logout: () => Promise<{ success, error? }>;
  refresh: () => Promise<void>;
}
```

## Methods

### `fetchMe()` (internal)

Calls `apiClient.getAuthMe()` to check current authentication status. Sets `user` from `/api/auth/me` response (`authenticated` + `user { id, username }`). Called by the provider on mount and after login.

`fetchMe({ silent: true })` is used for post-login refresh so the global `loading` flag does not flicker during the follow-up auth-state check.

### `login(username, password, remember?)`

1. Sets loading state
2. Calls `apiClient.login(username, password, remember)`
3. On success, calls `fetchMe()` to refresh user state
4. Returns `{ success, user?, error? }`

The backend sets an HTTP-only cookie on successful login.

### `logout()`

1. Sets loading state
2. Calls `apiClient.logout()` to clear the server-side cookie
3. Clears local `user` state
4. Returns `{ success, error? }`

### `refresh()`

Alias for `fetchMe()` — allows components to manually re-check auth status.

## Lifecycle

- On provider mount: Calls `fetchMe()` once to check existing session
- After login: Calls `fetchMe()` to confirm session
- After logout: Clears user state locally

In app wiring, `AuthProvider` wraps the route tree in [[apps/frontend/src/App.tsx]], so multiple components using `useAuth()` do not trigger duplicate auth bootstrap requests.

## Error Handling Notes

- Auth failure paths now use frontend structured logger warnings instead of direct `console.error` calls.
- Catch blocks use `unknown` typing for safer narrowing while preserving existing auth behavior.
- Related logging utility: `[[apps/frontend/src/lib/logger.ts]]`

## API Client Surface

- `useAuth` continues to import from `[[apps/frontend/src/services/ApiClient.ts]]` (public surface preserved)
- Internals are decomposed into `[[apps/frontend/src/services/apiClient/core.ts]]`, `[[apps/frontend/src/services/apiClient/endpoints.ts]]`, and `[[apps/frontend/src/services/apiClient/types.ts]]` without changing hook behavior

## Usage

```tsx
import { useAuth } from "@/hooks/useAuth";

function LoginPage() {
  const { login, loading, error } = useAuth();

  const handleSubmit = async (username, password) => {
    const result = await login(username, password);
    if (result.success) {
      // Redirect to dashboard
    }
  };
}

function Dashboard() {
  const { isAuthenticated, logout } = useAuth();
}
```

## Related

- [[docs/components/auth-guard|AuthGuard]] — Uses this hook for route protection
- [[docs/security/authentication|Authentication]] — Auth system documentation
- `[[apps/frontend/src/services/ApiClient.ts]]` — API client used by this hook
- `[[apps/frontend/src/App.tsx]]` — App-level `AuthProvider` integration
- `[[apps/backend/middleware/auth.js]]` — Backend auth middleware
- `[[apps/frontend/src/hooks/useAuth.test.tsx]]` — Verifies single bootstrap fetch across multiple consumers
