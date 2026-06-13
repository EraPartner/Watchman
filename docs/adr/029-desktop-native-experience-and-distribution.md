---
title: "ADR-029: Desktop native experience, hardening, and distribution"
type: adr
status: accepted
date: 2026-06-13
tags: [adr, desktop, electron, security, distribution]
description: Adds a native-app polish, renderer-security, and release layer on top of the ADR-016 Electron wrapper
aliases: [adr-029, desktop native experience, desktop distribution]
---

# ADR-029: Desktop native experience, hardening, and distribution

> [!abstract] Summary
> Build a native-app polish, renderer-security, and release layer on top of the
> existing Electron wrapper so `Watchman.app` feels and ships like a finished
> macOS application — without changing the embedded-backend runtime model.

## Status

- **Status**: Accepted
- **Date**: 2026-06-13
- **Extends**: [[docs/adr/016-electron-desktop-wrapper|ADR-016]] (does not supersede — the
  embedded-backend + `watchman://` protocol architecture is unchanged)

## Context

[[docs/adr/016-electron-desktop-wrapper|ADR-016]] established a clean, minimal
Electron shell: TypeScript, a free-port-spawned Node backend, and the frontend
served over a privileged `watchman://` scheme — no Docker, no external runtime
deps. The core was solid but the shell lacked the polish layer that makes an
Electron app read as native rather than as a wrapped web page: there was no app
icon, no window-state persistence, no native menus, no boot splash (the window
stayed blank until the backend was healthy), no recovery path if the backend
failed, and no renderer security headers. Distribution was a local
`install.sh` that built and copied the `.app`; there was no release artifact
flow (DMG/zip + checksums + publish).

The reference bar was Vision's desktop setup, but roughly half of Vision's
`main.js` is Docker/Postgres orchestration that Watchman's embedded-backend model
does not need. The goal was therefore to match Vision on the **shell-quality
dimensions that apply**, not to copy its bulk.

## Decision

Keep the ADR-016 runtime model (embedded Node backend, `watchman://` frontend)
and add four capability groups, organised into small main-process modules
(`settings.ts`, `splash.ts`, `logs.ts`, `menu.ts`) plus a frontend chrome hook:

1. **Native feel** — app icon (`build/icon.icns` from `icon.svg`); macOS
   `hiddenInset` title bar with under-window vibrancy and inset traffic lights;
   window bounds persisted to `<userData>/settings.json` (debounced, clamped to
   work area); a themed boot splash shown immediately while the backend starts.
2. **Robustness** — an `assets/error.html` recovery screen (Retry / Open Logs)
   when the backend never becomes healthy; a post-load health watchdog that
   emits `backend:lost` / `backend:restored` (native notification + renderer
   toast); native application + dock menus whose **Go** items navigate the SPA
   over a `menu:action` IPC channel; session log capture to
   `<userData>/logs/watchman-desktop.log`.
3. **Hardening** — a Content-Security-Policy on every `watchman://` response
   (`script-src 'self'`; `connect-src` limited to the loopback backend); a
   `will-navigate` allow-list; deny-all web permission handler.
4. **Distribution** — DMG **and** zip mac targets (arm64-only), a GitHub
   `publish` block, a `packaging/release/` flow (`README.md` + `make-release.sh`
   producing `*.sha256` checksums and a version-stamped readme), and a corrected
   `install.sh` (the old AUTH\_\*/JWT_SECRET hint was stale — the backend is
   no-auth and auto-creates its encryption key).

Two packaging realities of the npm-workspaces monorepo had to be handled for the
build to produce a working app: (a) `electron`/`electron-builder` are pinned to
exact versions in `apps/desktop/package.json`, because the hoisted `electron`
isn't found under `apps/desktop/node_modules` and electron-builder refuses a
caret range for its version fallback; (b) the backend's runtime deps are hoisted
to the repo root, so `scripts/stage-backend.mjs` materialises a complete
**production** dependency tree from the backend's standalone lockfile into
`apps/backend/.bundle`, which electron-builder bundles instead of the sparse
workspace `node_modules`. The backend's native `@duckdb` binding is arch-specific
(`darwin-arm64`), which is why the mac target is arm64-only.

The backend connection details are delivered to the renderer over a synchronous
`watchman:get-config` IPC reply instead of window `additionalArguments`, so they
resolve for any document the window loads (splash, app, or error page),
independent of window-creation order. All renderer-side behaviour is gated on the
desktop bridge, so the browser build is unaffected.

## Consequences

### Positive

- The app launches to an immediate splash, restores its window, has a real menu
  and icon, and recovers from backend failures instead of exiting silently.
- Renderer attack surface is materially reduced (CSP, navigation allow-list,
  permission denial) while keeping the trusted-network model of
  [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] /
  [[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025]].
- Releases are reproducible and verifiable (checksums) and publishable.

### Negative

- More main-process surface to maintain (four new modules + an error page).
- The CSP must track frontend needs; a future inline script or new external
  origin would require a CSP change.

### Risks

- macOS-specific chrome (`hiddenInset`, vibrancy, traffic-light inset) is only
  exercised on macOS; Windows/Linux fall back to the standard frame.
- The build is ad-hoc signed, so Gatekeeper still requires a one-time
  right-click → Open. Proper signing/notarisation is a separate, paid follow-up.

## Alternatives Considered

| Alternative                                   | Why Rejected                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Adopt Vision's Docker-supervisor model        | Watchman already embeds its backend and DuckDB; Docker would add a heavy user dependency for no benefit.                      |
| `electron-updater` auto-update                | Larger surface (latest-mac.yml/blockmaps) and needs signing to be smooth; deferred. The `publish` block leaves the door open. |
| Keep passing config via `additionalArguments` | Fixed at window creation, so it can't serve a splash-first / error-page flow; synchronous IPC is more flexible.               |

## References

- [[docs/guides/running-the-desktop-app|Running the Desktop Application]]
- [[docs/adr/016-electron-desktop-wrapper|ADR-016: Electron desktop wrapper]]
- Related code: `apps/desktop/src/main.ts`, `apps/desktop/src/settings.ts`,
  `apps/desktop/src/splash.ts`, `apps/desktop/src/menu.ts`,
  `apps/desktop/src/logs.ts`, `apps/desktop/src/frontendProtocol.ts`,
  `apps/desktop/assets/error.html`, `apps/frontend/src/hooks/useDesktopChrome.ts`,
  `apps/desktop/scripts/stage-backend.mjs`, `packaging/release/make-release.sh`
