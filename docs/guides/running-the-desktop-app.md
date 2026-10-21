---
title: Running the Watchman Desktop Application
type: guide
status: active
date: 2026-10-21
tags: [guide, desktop, electron, distribution, setup]
description: How to build, run, and deploy the Watchman Electron desktop application
aliases: [desktop app, electron, desktop guide]
---

# Running the Watchman Desktop Application

> [!abstract] Overview
> The Watchman desktop application is built with Electron and packages the React frontend with an auto-spawned Node.js backend. This guide covers development, testing, and building for distribution.

## Quick Start

### Run in Development Mode

```bash
npm run electron:dev
```

This command:

1. Builds the backend and frontend once
2. Starts Electron in development mode (`NODE_ENV=development`)
3. Opens the dashboard on `watchman://app/` (or `WATCHMAN_DEV_URL`, if set)

There is no watch mode: after a code change, stop the app and run the command again
(`package.json` `electron:dev`). For hot reload, run `npm run dev:frontend` and point
`WATCHMAN_DEV_URL` at the Vite server (see [Override Frontend Dev URL](#override-frontend-dev-url)).

### Run in Production Mode (Packaged)

```bash
npm run electron:prod
```

Builds the backend + frontend and launches the Electron app against the built artifacts.

### Build Distributable Package

```bash
npm run dist
```

This command:

1. Builds frontend and backend
2. Stages the backend's production dependencies and runs electron-builder for the
   **host** platform only (on a Mac: an Apple Silicon `.dmg` and `.zip`)
3. Outputs to `apps/desktop/out/`

> [!important] Apple Silicon only
> The macOS build targets `arm64` only (`apps/desktop/electron-builder.yml`). It does not
> run on Intel Macs. See [Building for Distribution](#building-for-distribution).

## Native Desktop Experience

The shell behaves like a first-class native app, not a wrapped web page:

- **Boot splash** — a themed splash window appears immediately on launch and
  narrates startup (`Starting backend…` → `Loading…`) while the bundled backend
  comes up, then swaps in the dashboard once `/meta/health` is green.
- **macOS chrome** — on macOS the window uses an inset title bar
  (`titleBarStyle: 'hiddenInset'`) with under-window vibrancy. The renderer tags
  `<html data-desktop="macos">` (via `useDesktopChrome`) so the topbar clears the
  traffic lights and becomes a window drag region; interactive controls opt out
  with `-webkit-app-region: no-drag`.
- **Closing the window keeps the app running (macOS)** — closing the last window does
  not quit the app or stop the backend; Watchman stays in the Dock. Click the Dock icon
  to reopen the window, and use **Quit** (⌘Q) to stop the app and its backend. On
  Windows and Linux, closing the last window quits (`window-all-closed` in
  `apps/desktop/src/main.ts`).
- **Window state** — size and position are persisted to
  `<userData>/settings.json` (debounced, clamped to the visible work area) and
  restored on the next launch.
- **Application & dock menus** — a full native menu (App / File / Edit / View /
  Go / Window / Help). The **Go** menu navigates the SPA via ⌘1–⌘5; **Help → Open
  Logs** opens the session log. Menu/dock actions reach the renderer over a
  `menu:action` IPC channel handled by `DesktopChrome`.
- **Error / recovery screen** — if the backend never becomes healthy, the window
  loads `assets/error.html` with **Retry** and **Open logs** buttons instead of
  failing silently.
- **Health watchdog** — after load, the main process polls the backend; a run of
  failures fires a native notification and a `backend:lost` event (surfaced as a
  toast), and a `backend:restored` event clears it.
- **App icon** — `apps/desktop/build/icon.icns` (rendered from `icon.svg`).

> [!note] Browser build unaffected
> All of the above is gated on the desktop bridge (`window.__WATCHMAN__` /
> `window.watchmanDesktop`). In the plain web build the hooks no-op, so the
> frontend renders identically in a browser.

## Security (desktop)

The shell follows the same trusted-network model as the backend
([[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] /
[[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025]]) and
adds renderer hardening:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- A **Content-Security-Policy** is attached to every `watchman://` response
  (`script-src 'self'`; `connect-src` allows only the loopback backend over
  HTTP/WS). Dev (Vite) loads from its own origin and is unaffected.
- A **navigation allow-list** (`will-navigate`, `src/navigation.ts`) pins the
  window to `watchman://`, the backend's exact origin and, in unpackaged dev
  runs, the `WATCHMAN_DEV_URL` origin. Other URLs, including `file:` and other
  loopback ports, are bounced to the system browser (non-web schemes are
  dropped). `window.open` is denied and opened externally.
- All web **permission requests are denied** (camera/mic/geolocation/etc.);
  notifications are fired natively from the main process.

## Data and Configuration

### Master Key

On first run, the backend auto-generates a **per-installation master key**
(`apps/backend/src/config/masterKey.ts`):

- **Location**: `<userData>/data/master.key` (the desktop app sets `DATA_DIR` to
  `<userData>/data`). `<userData>` is Electron's per-app folder, named after the
  `productName` (`Watchman`) in the packaged app:
  - **macOS**: `~/Library/Application Support/Watchman/data/master.key`
  - Windows and Linux use Electron's matching user-data folder (not verified on those
    platforms).
- **Format**: Base64-encoded 32 random bytes
- **Permissions**: Mode `0600` (user-only read/write)
- **Purpose**: Encrypts all service credentials stored in DuckDB

> [!warning] Master Key Loss
> If this file is deleted, all encrypted service credentials become unrecoverable. Back it up if you frequently reconfigure services. Key rotation requires re-entering all service credentials on the new installation.

### Data Directory

Service configuration, profiles and the audit log:

- **Location**: `<userData>/data/` (same folder as the master key)
- **Contents**:
  - `watchman.duckdb` — DuckDB database (`apps/backend/src/index.ts`)
  - `watchman.duckdb.wal` — DuckDB write-ahead log (temporary)

There is no time-series store; it was removed in
[[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]].

### Desktop State & Logs

Files written by the Electron shell itself (separate from the backend's data):

- `<userData>/settings.json` — desktop settings (currently window bounds).
  Quarantined to `settings.json.corrupt-<ts>` rather than clobbered if it ever
  fails to parse.
- `<userData>/logs/watchman-desktop.log` — combined backend stdout/stderr for
  the current session (truncated each launch). Opened by **Help → Open Logs** and
  the error screen's **Open logs** button.

## Development Workflow

### Attach to External Backend (Dev Mode)

To develop the frontend independently or test the backend separately, skip the auto-spawned backend:

```bash
WATCHMAN_SKIP_BACKEND_SPAWN=1 npm run electron:dev
```

Then start your backend manually:

```bash
cd apps/backend
npm run dev
```

The frontend will connect to `http://localhost:3001` (or your configured backend URL).

### Backend Runtime

The desktop app runs the backend with Electron's own binary (`ELECTRON_RUN_AS_NODE=1`). It does not use the system `node`, and there is no variable to override the runtime path.

### Backend Shutdown

On quit the shell sends the backend `SIGTERM`, waits up to 2 s, then sends
`SIGKILL` if it is still running (`apps/desktop/src/childStop.ts`). The same
applies to a backend that never became healthy and to one still starting when
the app quits, so no orphaned backend keeps the DuckDB file locked.

### Desktop Tests

```bash
npm test --workspace=apps/desktop
```

Uses Node's built-in test runner on `apps/desktop/test/*.test.ts` (no Electron
needed). It is not part of CI.

### Override Frontend Dev URL

For testing a custom frontend server:

```bash
WATCHMAN_DEV_URL=http://localhost:5173 npm run electron:dev
```

## Building for Distribution

`npm run dist` builds for the **host** platform/arch. Because the bundled backend
carries a native (`@duckdb`) binding, build each platform on that platform (or a
matching cross-build) so `stage-backend.mjs` installs the correct binding. macOS
is the primary, fully-exercised target.

### macOS (arm64)

```bash
npm run dist
```

Outputs:

- `apps/desktop/out/Watchman-<version>-arm64.dmg` — DMG installer
- `apps/desktop/out/Watchman-<version>-arm64-mac.zip` — zip alternative
- `apps/desktop/out/mac-arm64/Watchman.app` — unsigned `.app` bundle

The build is **ad-hoc signed** (no paid Apple Developer ID), so the first launch
needs a one-time right-click → Open to clear Gatekeeper.

> [!important] Backend is staged, and the target is arm64-only
> Because the backend's runtime dependencies are hoisted to the repo-root
> `node_modules`, `npm run package` first runs `scripts/stage-backend.mjs`, which
> materialises a complete **production** dependency tree from the backend's
> standalone lockfile into `apps/backend/.bundle` (gitignored). electron-builder
> bundles that, not the sparse workspace `node_modules` — otherwise the packaged
> backend can't resolve `dotenv` et al. and exits with code 1.
>
> The backend ships an arch-specific `@duckdb` prebuilt binding
> (`darwin-arm64`), so the mac target is **arm64-only**; an x64/universal build
> would need the backend staged with the x64 binding too (not yet wired).

### Release artifacts & checksums

```bash
packaging/release/make-release.sh            # build, then assemble
packaging/release/make-release.sh --no-build # assemble from existing out/
```

This builds the app, writes a `*.sha256` next to each `.dmg`/`.zip`, and drops a
version-stamped `README.md` (from `packaging/release/README.md`) into
`apps/desktop/out/`. GitHub Releases upload is configured via the `publish` block
in `apps/desktop/electron-builder.yml` — run electron-builder with `--publish` and
a `GH_TOKEN` to upload.

### Windows (NSIS)

Configured in `electron-builder.yml` but not exercised; unverified. Requires running on Windows or a cross-compile setup.

```bash
npm run dist
```

Outputs:

- `apps/desktop/out/Watchman Setup <version>.exe` — NSIS installer

### Linux (AppImage + deb)

Configured in `electron-builder.yml` but not exercised; unverified.

```bash
npm run dist
```

Outputs:

- `apps/desktop/out/watchman-<version>.AppImage` — Portable AppImage
- `apps/desktop/out/watchman-<version>.deb` — Debian package

## Environment Variables

### Desktop-Specific

| Variable                      | Description                                                                                                         | Default           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `WATCHMAN_SKIP_BACKEND_SPAWN` | `1` skips the backend auto-spawn and attaches to a backend on `127.0.0.1:${BACKEND_V2_PORT:-3001}` (unpackaged only) | unset (auto-spawn) |
| `WATCHMAN_DEV_URL`            | Frontend URL override (dev mode only)                                                                               | `watchman://app/` |

The backend child process runs with Electron's own binary (`ELECTRON_RUN_AS_NODE=1`), not a separate `node` from `PATH`.

### Set for the Backend by the Desktop App

The main process (`apps/desktop/src/backend.ts`) spawns the backend with these values; other backend variables pass through from the environment. The backend's working directory is `<userData>`, so `.env.local` / `.env` are read from there, not from wherever the app was launched:

| Variable              | Value set by the desktop app                                         |
| --------------------- | -------------------------------------------------------------------- |
| `BACKEND_V2_PORT`     | The port chosen by the main process                                  |
| `BACKEND_V2_HOST`     | `127.0.0.1`                                                          |
| `DATA_DIR`            | `<userData>/data`                                                    |
| `NODE_ENV`            | `production` when packaged; otherwise inherited or `development`     |
| `WATCHMAN_MASTER_KEY` | Not set; the backend auto-provisions `{DATA_DIR}/master.key` if unset |

> [!note] Not Applicable
> There are no authentication variables (`AUTH_*`, `JWT_SECRET`) and no `FRONTEND_URL`; they were removed (see [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]]). Service connections are configured in the Setup Wizard and stored in DuckDB, not in environment variables.

## Troubleshooting

### Backend Fails to Start

1. Check the backend build exists (`npm run build:backend`) when running from the repository
2. Verify the free port acquisition: backend logs should show the allocated port
3. Check for port conflicts: is another service using the selected free port?
4. Check that `<userData>/data` is writable and `master.key` there is not empty

### Frontend Can't Connect to Backend

1. Confirm backend is running: check for `BACKEND_V2_PORT` in console logs
2. Verify health check passes: `curl http://127.0.0.1:<port>/meta/health`
3. Check for CORS errors: the backend must emit `Access-Control-Allow-Origin: watchman://...` headers
4. If using external backend, ensure `WATCHMAN_SKIP_BACKEND_SPAWN=1` and backend is running on expected port

### Master Key Missing After Reinstall

Reinstalling the app does not touch `<userData>`, so the key and database stay. A new
key is generated only when `<userData>/data/master.key` is gone (for example, a new Mac
or a deleted folder). Secrets encrypted with the old key cannot be decrypted with a new
one.

To move to a new machine:

1. Copy the whole `<userData>/data/` folder (database **and** `master.key`), or
2. Export a backup in **Settings → Backup & Restore**, import it on the new machine, and
   re-enter any secrets that do not work there (not verified end to end).

### Crashes on Startup

1. Check the Console app (macOS) or Event Viewer (Windows) for crash logs
2. Verify frontend and backend builds are present: `apps/frontend/dist/` and `apps/backend/dist/`
3. Clear userData and restart (will regenerate master key on next run, but you'll lose saved config):
   ```bash
   rm -rf ~/Library/Application\ Support/Watchman/  # macOS
   ```

## Related

- [[docs/adr/016-electron-desktop-wrapper|ADR-016]] — Electron wrapper architecture and rationale
- [[docs/adr/029-desktop-native-experience-and-distribution|ADR-029]] — Native desktop polish, hardening, and distribution layer
- [[docs/guides/setup|Setup Guide]] — Initial configuration and service setup
- [[docs/features/ui-configuration|UI Configuration Feature]] — Service management and secrets
- [[docs/reference/scripts|Scripts Reference]] — All npm commands
- [[docs/reference/environment-variables|Environment Variables]] — Full reference

## PlantUML Diagrams

### Desktop App Lifecycle

```plantuml
@startuml
!theme plain

actor "User" as User
participant "Electron" as Electron
participant "Backend" as Backend
participant "Frontend" as Frontend

User -> Electron: Launch app
Electron -> Electron: Register watchman:// protocol
Electron -> Electron: Load window config

alt First Run
    Electron -> Electron: Generate master.key
    Electron -> Electron: Write to userData
end

Electron -> Backend: Spawn node process\nWATCHMAN_MASTER_KEY=...
Electron -> Electron: Wait for backend health check
Backend -> Backend: Start on free port
Backend -> Electron: /meta/health OK

Electron -> Frontend: Load watchman://app/
Frontend -> Frontend: Detect window.__WATCHMAN__\n(isDesktop=true)
Frontend -> Backend: Fetch /services
Backend -> Frontend: JSON response
Frontend -> User: Render dashboard

User -> User: Interact with app

User -> Electron: Quit app
Electron -> Backend: SIGTERM
Backend -> Backend: Graceful shutdown
Backend -> Electron: Exit (SIGKILL after 2s if still running)

Electron -> Electron: Close window
Electron -> User: App quit

@enduml
```

### File Structure

```plantuml
@startuml
!theme plain

folder "apps/desktop" as Desktop {
    file "package.json" as DSK_PKG
    file "tsconfig.json" as DSK_TS
    file "electron-builder.yml" as DSK_BUILD
    folder "src" as DSK_SRC {
        file "main.ts" as MAIN
        file "preload.ts" as PRELOAD
        file "backend.ts" as BACKEND_SPAWN
        file "frontendProtocol.ts" as PROTOCOL
        file "freePort.ts" as FREEPORT
        file "settings.ts" as SETTINGS
        file "splash.ts" as SPLASH
        file "logs.ts" as LOGS
        file "menu.ts" as MENU
    }
    folder "assets" as DSK_ASSETS {
        file "error.html" as ERRHTML
    }
    folder "build" as DSK_BUILDRES {
        file "icon.icns / icon.svg" as ICON
    }
    folder "dist" as DSK_DIST {
        file "main.js" as MAIN_JS
        file "..." as MISC
    }
}

folder "apps/backend/dist" as BE_DIST {
    file "index.js" as BE_JS
}

folder "apps/frontend/dist" as FE_DIST {
    file "index.html" as FE_HTML
}

folder "userData" as DATA {
    file "master.key" as MASTER
    folder "data" as DATADIR {
        file "timeseries.duckdb" as DUCKDB
    }
}

DSK_PKG --> DSK_SRC
DSK_DIST --> MAIN_JS
MAIN_JS --> BE_DIST
MAIN_JS --> FE_DIST
BE_DIST --> DATA
FE_DIST --> DATA

@enduml
```
