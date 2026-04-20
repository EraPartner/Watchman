---
title: Electron Desktop Wrapper for Watchman
type: adr
status: accepted
date: 2026-04-19
tags: [adr, electron, desktop, custom-protocol, architecture, distribution]
description: Rationale for packaging Watchman as a standalone Electron desktop application with auto-spawned backend and custom watchman:// protocol support
aliases: [electron desktop, desktop app, watchman protocol]
---

# ADR-016: Electron Desktop Wrapper

> [!abstract] Summary
> Watchman is packaged as a standalone Electron desktop application (Electron 33, electron-builder 25) that spawns a system Node.js backend process, serves the React frontend via a custom `watchman://` protocol, and manages per-installation secrets (master key) in Electron's userData directory.

## Status

- **Status**: Accepted
- **Date**: 2026-04-19
- **Relates to**: [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] (Backend rewrite), [[docs/adr/008-configuration-environment-variables|ADR-008]] (Configuration)

## Context

Watchman originally shipped as a web application requiring manual setup (server installation, reverse proxy, domain/SSL). To broaden adoption and simplify deployment for home-lab users, a desktop distribution was needed that:

1. **Eliminates infrastructure friction**: Users should not need to set up SSL, domain names, or reverse proxies
2. **Provides a bundled experience**: Single download → run → dashboard, no manual backend start
3. **Manages secrets safely**: Per-installation master keys for encrypting service credentials, stored securely in the OS user's config directory
4. **Supports multiple platforms**: macOS (arm64+x64), Windows (NSIS), Linux (AppImage+deb)
5. **Maintains dev/test flexibility**: Allow attaching to an external backend for development

## Decision

Watchman ships as an Electron 33 application with the following architecture:

### Process Model

- **Electron main process** (sandbox + contextIsolation enabled):
  - Registers custom `watchman://` protocol before `app.whenReady()` (required by Electron)
  - Spawns a system `node` process running the compiled TypeScript + Fastify backend on a free loopback port
  - Creates a single `BrowserWindow` that loads the frontend via `watchman://app/index.html`
  - Manages graceful backend shutdown on app quit (2s grace period, then SIGKILL)
  - Prevents multiple app instances (single-instance lock)

- **Preload script** (nodeIntegration=false, sandbox=true):
  - Reads `--watchman-api-url` and `--watchman-ws-url` from `process.argv` (passed via `additionalArguments` in BrowserWindow config)
  - Exposes `window.__WATCHMAN__ = { apiUrl, wsUrl, isDesktop: true }` via contextBridge
  - Locked to a single function; no other IPC bridges

- **Renderer process**:
  - Loads React frontend from `frontend/dist/`
  - Detects desktop environment via `window.__WATCHMAN__.isDesktop`
  - Frontend URL resolution prefers `window.__WATCHMAN__.apiUrl` if present; otherwise uses built-in defaults
  - External links open via `shell.openExternal()` in OS browser

- **Backend process** (Node.js):
  - Spawned with environment overrides:
    - `BACKEND_V2_PORT` = acquired free port
    - `BACKEND_V2_HOST` = `127.0.0.1` (loopback only, no network exposure)
    - `DATA_DIR` = Electron `userData + /data` (typically `~/.config/watchman/data` on Linux, `~/Library/Application Support/io.watchman.desktop/data` on macOS)
    - `WATCHMAN_MASTER_KEY` = auto-provisioned on first run (base64-encoded 32-byte AES key, mode 0600)
  - Health check via `GET /meta/health` (20s timeout)
  - Graceful shutdown: SIGTERM → wait 2s for clean exit → SIGKILL if still running
  - Can be disabled via `WATCHMAN_SKIP_BACKEND_SPAWN=1` for dev/test (attach to external backend)

### Custom Protocol (`watchman://`)

- Registered as a **secure, standard protocol** (not `file://`):
  - `supportFetchAPI: true` — allows `fetch()` from renderer
  - `corsEnabled: true` — permits CORS checks
  - `stream: true` — supports range requests and streaming
- Handler serves files from `frontend/dist/` with:
  - **Path traversal guard**: Rejects paths with `..` or absolute paths
  - **SPA fallback**: Routes unmatched paths to `index.html` for React Router
- URLs: `watchman://app/index.html`, `watchman://app/`, etc.

**Why not `file://`?** File URLs lack proper CORS support and create security boundaries that conflict with the frontend's fetch patterns. The custom protocol is cleaner and safer.

### Master Key Auto-Provisioning

On first desktop run:
1. Check `<userData>/master.key` for existing key
2. If not present:
   - Generate 32 random bytes
   - Encode as base64
   - Write to `<userData>/master.key` with mode `0600` (user-only read/write)
   - Inject as `WATCHMAN_MASTER_KEY` when spawning backend
3. All subsequent runs reuse the stored key

**Per-installation unique key**: Each user/machine has its own master key; secrets are not portable between installations.

### Distribution via electron-builder

Targets:
- **macOS**: DMG installer (universal binary, arm64+x64)
- **Windows**: NSIS installer (x64)
- **Linux**: AppImage + deb (x64)

Bundled resources:
- `apps/backend/dist/` (compiled backend)
- `apps/backend/node_modules/` (backend dependencies)
- `apps/backend/package.json` (for runtime metadata)
- `apps/backend/.env.example` (for reference)
- `apps/frontend/dist/` (compiled frontend)

### API CORS for Desktop Origins

Fastify backend adds an `onRequest` hook:
- When `Origin: watchman://...` is detected, emit permissive CORS headers:
  ```
  Access-Control-Allow-Origin: watchman://...
  Access-Control-Allow-Credentials: true
  ```
- Preflight OPTIONS requests return 204 No Content
- Maintains normal CORS checks for other origins (web deployments)

## Consequences

### Positive

- **Frictionless onboarding**: Single download + run → dashboard (no infrastructure setup)
- **Secure secret management**: Per-installation master keys, stored in OS user directory with proper file permissions
- **Isolated loopback backend**: Backend never exposed to network; cannot be accessed from other machines
- **Cross-platform support**: Electron handles platform-specific details (process spawning, app lifecycle, userData paths)
- **Dev flexibility**: `WATCHMAN_SKIP_BACKEND_SPAWN=1` allows attaching to a separate backend for testing/iteration
- **Graceful degradation**: If backend fails to start, frontend detects it and shows error UI
- **No auto-updater complexity**: Each release is a new installer download (no Electron updater framework)

### Negative

- **Electron size overhead**: Bundles Chromium (~150-180MB per platform); increases total distribution size
- **System Node.js dependency**: Relies on system `node` (configurable via `WATCHMAN_BACKEND_NODE`); may not be present on all machines
- **Per-machine key management**: Master keys are not portable; rotating keys requires re-entering all service credentials
- **Limited distribution channels**: Only macOS (DMG), Windows (NSIS), Linux (AppImage/deb) are supported; no app store integration yet
- **Backend subprocess overhead**: Spawning and managing a separate Node.js process adds complexity to app lifecycle
- **Scope limitation**: Focus on single-instance desktop app; not designed for multi-user shared monitoring (see ADR-015 for server-mode configuration)

### Risks

- **Backend startup failure**: If Node.js is missing or outdated, backend fails to spawn; frontend detects health check timeout and shows error
- **Master key loss**: If user deletes `<userData>/master.key`, all encrypted secrets become unrecoverable on that installation
- **Port conflicts**: If the acquired free port is unavailable by backend startup, backend fails; health check timeout triggers error UI
- **Process leaks**: If app crashes before SIGKILL, the backend process may remain running and hold the loopback port

## Alternatives Considered

| Alternative | Why Rejected |
| --- | --- |
| **Tauri desktop wrapper** | Lighter than Electron (Rust + web view), but adds a new language to the stack and lacks the maturity for production use; Electron 33 is battle-tested and ships with Node 20.18.3 |
| **Package as systemd service** | Suitable for server deployments, but adds complexity for home-lab users who want "download and run"; desktop app is simpler UX |
| **Embed Node backend in Electron native module** | Eliminates system Node.js dependency, but requires building native modules for each platform (complex CI/CD); system `node` is acceptable for target audience |
| **Web-only deployment with reverse proxy templates** | Current approach (still supported), but requires manual SSL/domain setup; desktop variant lowers barrier to entry |
| **Use Electron `spawn()` from main process with custom protocol** | Matches final design; considered file:// instead of custom protocol, but file:// breaks CORS checks |
| **Store master key in Keychain/Windows Credential Manager** | Higher security, but adds platform-specific code and error handling; userData file with 0600 is acceptable for home-lab context |

## References

- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] — Backend rewrite with TypeScript + Fastify 4
- [[docs/adr/015-ui-driven-service-configuration|ADR-015]] — UI-driven configuration with encrypted secrets
- [[docs/adr/008-configuration-environment-variables|ADR-008]] — Environment variable configuration patterns
- [[docs/architecture/backend-architecture|Backend Architecture]] — Fastify setup and layered design
- [[apps/desktop/src/main.ts|Main Process Entry]] — Electron app setup
- [[apps/desktop/electron-builder.yml|electron-builder Config]] — Distribution targets and bundling
- [[apps/backend/src/transport/http/server.ts|HTTP Server]] — CORS hook for watchman:// origins
- Electron docs: https://www.electronjs.org/docs
- electron-builder docs: https://www.electron.build/

## Related Decisions

- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] — Time-series backend and bento UI (desktop app benefits from these features)
- [[docs/features/ui-configuration|UI Configuration Feature]] — Master key and encrypted secrets (desktop app auto-provisions the key)
