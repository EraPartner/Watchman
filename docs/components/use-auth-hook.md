---
title: useAuth Hook
type: component
status: active
date: 2026-04-09
tags: [hook, frontend, react, auth, authentication]
description: Authentication state management hook providing login, logout, and session checking via cookie-based backend auth
aliases: [auth hook, authentication hook, login hook]
---

# useAuth

> [!abstract] Summary
> A React hook that manages authentication state, providing login, logout, and session checking functionality via the backend's cookie-based authentication endpoints.

## Overview

`useAuth` is the central authentication hook for the Watchman frontend. It communicates with the backend's cookie-based auth system, manages local auth state, and provides a simple API for components to check and modify authentication status.

## File Location

`[[apps/frontend/src/hooks/useAuth.tsx]]`

## State

| State     | Type                           | Description                             |
| --------- | ------------------------------ | --------------------------------------- |
| `user`    | `{ username: string } \| null` | Current authenticated user              |
| `loading` | `boolean`                      | Whether auth operations are in progress |
| `error`   | `string \| null`               | Last error message                      |

## Return Value

```typescript
{
  user: { username: string } | null;
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

Calls `apiClient.getAuthMe()` to check current authentication status. Sets `user` based on the response. Called on mount and after login.

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

- On mount: Calls `fetchMe()` to check existing session
- After login: Calls `fetchMe()` to confirm session
- After logout: Clears user state locally

## Error Handling Notes

- Auth failure paths now use frontend structured logger warnings instead of direct `console.error` calls.
- Catch blocks use `unknown` typing for safer narrowing while preserving existing auth behavior.
- Related logging utility: `[[apps/frontend/src/lib/logger.ts]]`

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
- `[[apps/backend/middleware/auth.js]]` — Backend auth middleware
