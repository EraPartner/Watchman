---
title: OfflineBanner Component
type: component
status: active
date: 2026-04-20
tags: [component, frontend, split-deploy, offline, banner, reachability]
description: Fixed-top offline notification banner displayed when the Raspberry Pi backend is unreachable in split-deploy mode
aliases: [offline banner, reachability banner]
---

# OfflineBanner Component

> [!abstract] Overview
> The OfflineBanner is a fixed-position banner mounted at the top of the app in split-deploy mode (Electron client + Raspberry Pi backend). It detects when the backend becomes unreachable (via polling `/meta/health`) and displays an offline state with Retry and Change URL controls.

## Implementation

**File**: `[[apps/frontend/src/components/OfflineBanner.tsx]]`

**Integration**: Mounted in `[[apps/frontend/src/App.tsx|App.tsx]]` inside the `<WebSocketProvider>` so it persists across all routes and pages.

## Behavior

The banner uses `useBackendReachable()` hook to monitor backend health:

- **Probing**: Polls `GET {apiUrl}/meta/health` every 10 seconds with a 3-second timeout
- **Failure threshold**: After 3 consecutive probe failures, the banner becomes visible with offline state
- **On success**: Immediately clears failure count and hides banner
- **Gated**: Only appears when `apiUrl` is set (split-deploy mode); hidden in dev or bundled mode

## UI

When offline:

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠ Cannot reach backend at http://192.168.1.10:3001            │
│                        [Retry]  [Change URL]                   │
└────────────────────────────────────────────────────────────────┘
```

**Retry Button**:
- Calls `probe()` immediately to check backend health
- Clears the offline state if successful
- Useful if the Pi was briefly unreachable and is now back

**Change URL Button**:
- Calls `bridge.saveApiUrl('')` to clear the stored URL
- Calls `bridge.reload()` to reload the app
- User lands on SetupWizard ConnectStep to enter a new backend URL
- Enables recovery if the Pi's IP changed or was replaced

## Styling

- Fixed positioning at the top of the viewport (z-index managed to stay above other content)
- Warning tone (orange/amber color scheme, matching primitives design)
- Responsive design; text stacks on mobile
- Non-dismissible; banner persists until backend is reachable again

## Integration with SetupWizard

- Banner is **not** shown during the setup wizard (ConnectStep already provides URL entry)
- After user completes ConnectStep, app reloads with `apiUrl` set
- On subsequent loads, if backend is offline, banner appears

## Related

- [[docs/hooks/use-backend-reachable|useBackendReachable Hook]] — Polling and reachability state
- [[docs/components/setup-wizard|Setup Wizard Components]] — ConnectStep for initial pairing
- [[docs/adr/018-split-deploy-pi-backend|ADR-018]] — Split Deploy architecture and offline UX
- [[docs/components/index|Components Index]]
