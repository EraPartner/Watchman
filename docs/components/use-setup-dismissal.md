---
title: useSetupDismissal Hook
type: component
status: active
date: 2026-04-19
tags: [hook, frontend, setup, localStorage, wizard, onboarding, state, dismissal, v2]
description: Custom React hook for managing setup wizard dismissal state via localStorage
aliases: [useSetupDismissal, setup dismissal hook, wizard state]
---

# useSetupDismissal Hook

> [!abstract] Summary
> `useSetupDismissal` is a custom React hook that manages the dismissal state of the setup wizard using browser localStorage. Users can skip the wizard and prevent it from showing again, or manually reset the flag to re-enter setup mode.

## Usage

```typescript
import { useSetupDismissal } from "./hooks/useSetupDismissal";

function MyComponent() {
  const { dismissed, dismiss, reset } = useSetupDismissal();

  if (dismissed) {
    return <div>Wizard has been dismissed</div>;
  }

  return (
    <button onClick={() => dismiss()}>
      Skip wizard and don't show again
    </button>
  );
}
```

## API

### useSetupDismissal()

Returns an object:

```typescript
{
  dismissed: boolean;      // true if user has dismissed the wizard
  dismiss: () => void;     // Set dismissed = true, write to localStorage
  reset: () => void;       // Set dismissed = false, remove from localStorage
}
```

### dismissed

**Type**: `boolean`

Initial value read from localStorage key `"watchman.setupDismissed"`. Synced with state via `useEffect` listening to `storage` events (allows cross-tab synchronization).

### dismiss()

**Type**: `() => void`

- Writes `"1"` to `localStorage["watchman.setupDismissed"]`
- Updates local state to `true`
- Safe no-op if localStorage is unavailable (try-catch)

### reset()

**Type**: `() => void`

- Removes `"watchman.setupDismissed"` from localStorage
- Updates local state to `false`
- Allows user to re-enter setup wizard
- Safe no-op if localStorage is unavailable (try-catch)

## Implementation Details

**File**: `[[apps/frontend/src/hooks/useSetupDismissal.ts]]`

### State Synchronization

1. **Read on mount**: Calls `read()` helper to check localStorage
2. **Sync across tabs**: Listens to `window.storage` event (fires when another tab updates localStorage)
3. **Cleanup**: Removes listener on unmount

```typescript
useEffect(() => {
  const handler = (e: StorageEvent) => {
    if (e.key === KEY) setDismissed(read());
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}, []);
```

### Storage Key

**Key**: `"watchman.setupDismissed"`

**Value**: `"1"` (truthy) or absent (falsy)

Simple string-based flag to minimize storage footprint.

### Error Handling

All localStorage operations wrapped in try-catch. If localStorage is unavailable (private browsing, quota exceeded, etc.):
- `read()` returns `false`
- `dismiss()` silently no-ops
- `reset()` silently no-ops

The hook degrades gracefully — dismissal is lost on refresh but the app continues to function.

## Integration with SetupWizard

Used in `[[docs/components/setup-wizard|SetupWizard]]` and `App.tsx`:

1. **SetupWizard.tsx**: Calls `dismiss()` when user clicks "Skip for Now"
   ```typescript
   const handleSkip = useCallback(() => {
     dismiss();
     navigate("/", { replace: true });
   }, [dismiss, navigate]);
   ```

2. **App.tsx**: Checks `dismissed` in `SetupGate` to decide whether to redirect to `/setup`
   ```typescript
   function SetupGate({ children }: { children: ReactNode }) {
     const { data, isLoading } = useSetupStatus();
     const { dismissed } = useSetupDismissal();
     if (isLoading) return <PageLoader />;
     if (data?.needsSetup && !dismissed) return <Navigate to="/setup" replace />;
     return <>{children}</>;
   }
   ```

## Design Rationale

**Why localStorage instead of state?**
- Persists across page refreshes
- Survives browser restarts
- Synchronized across tabs

**Why include `reset()`?**
- Allows users to re-enter setup wizard manually (e.g., from Settings page)
- Useful for testing and support scenarios

**Why try-catch all localStorage access?**
- Private browsing mode can throw on write
- Storage quota can be exceeded
- Some security policies block localStorage

## Related

- [[docs/components/setup-wizard|Setup Wizard Components]]
- [[docs/features/ui-configuration|UI Configuration Feature]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/components/index|Components Index]]
