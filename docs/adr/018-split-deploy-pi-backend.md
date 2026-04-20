---
title: Split Deploy — Raspberry Pi Backend + Mac Electron Client
type: adr
status: accepted
date: 2026-04-19
tags: [adr, deployment, raspberry-pi, electron, systemd, lan, split-deploy]
description: Relocate Watchman backend to an always-on Raspberry Pi and reduce Electron to a pure client so polling is continuous and the Mac's sleep cycle no longer creates history gaps
aliases: [ADR-018, pi deploy, split deploy, always-on backend]
---

# ADR-018: Split Deploy — Raspberry Pi Backend + Mac Electron Client

> [!abstract] Summary
> Move the Watchman backend out of the Electron subprocess and run it natively on a Raspberry Pi under systemd. Electron becomes a thin client that pairs with the Pi URL once via a setup-wizard step and shows an offline banner when the Pi is unreachable.

## Status

- **Status**: Accepted
- **Date**: 2026-04-19
- **Extends**: [[docs/adr/016-electron-desktop-wrapper|ADR-016]] (Electron wrapper), [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] (single-user, LAN-only posture)

## Context

Previously the Mac Electron app spawned the Fastify backend as a child process on `127.0.0.1:3001` and stored DuckDB state inside the Mac user-data directory ([[apps/desktop/src/backend.ts|backend.ts]]). This meant:

- When the Mac slept, the poller stopped. History gaps appeared in the time-series for every service.
- The backend subprocess was tied to a single machine; another Mac on the LAN could not see the same state.
- Master-key provisioning (AES-256-GCM for encrypted secrets) lived in the Electron main process — any other launch target had to reimplement it.

Confirmed constraints from the user:

- LAN-only (same Wi-Fi). No auth, no TLS — extends [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]].
- **Native deployment** on the Pi — `git clone` + `nvm` Node 22 + `npm install` + `npm run build` + systemd. Docker explicitly rejected.
- Data directory at `~/.watchman/data/` outside the repo so `git clean -fdx` cannot wipe history.
- Greenfield data on the Pi. Single Mac client. Manual static-IP URL entry at setup time.
- Offline UX: banner + Retry + Change URL. No cache layer, no local fallback.
- Update flow: `git pull && npm install && npm run -w apps/backend build && sudo systemctl restart watchman`.

## Decision

### Backend self-provisioning

Master-key create/read logic moves from Electron into the backend. New module `apps/backend/src/config/masterKey.ts` reads `{DATA_DIR}/master.key` (mode 0600), generates 32 random bytes base64 on first boot if the file is absent, and returns the key. Called from [[apps/backend/src/index.ts|index.ts]] bootstrap before any secret-encrypting consumer initialises. Works identically whether launched by systemd on the Pi or by a developer's `npm run dev`.

### Native systemd deployment on the Pi

- Unit file [[apps/backend/deploy/watchman.service|watchman.service]] with `Type=simple`, `User=pi`, `WorkingDirectory=/home/pi/watchman/apps/backend`, `ExecStart` pinned to the absolute nvm-installed Node path, `Environment=DATA_DIR=/home/pi/.watchman/data`, `Restart=on-failure`, `After=network-online.target`.
- systemd does not source `~/.bashrc`, so the nvm Node path must be absolute (`/home/pi/.nvm/versions/node/vXX.Y.Z/bin/node`) or wrapped in `/bin/bash -lc`. Documented in the deploy guide.
- Deploy guide at [[docs/guides/deploying-to-raspberry-pi|deploying-to-raspberry-pi.md]] covers nvm install, clone, build, unit install, firewall, DHCP reservation, update recipe.

### Electron as pure client

- `apps/desktop/src/backend.ts` deleted. No more subprocess spawn, healthcheck loop, shutdown handler, or master-key provisioning on the Mac.
- New `apps/desktop/src/clientConfig.ts` persists `{ apiUrl }` at `{app.getPath('userData')}/client-config.json`.
- IPC handlers: `watchman:getApiUrl`, `watchman:saveApiUrl(url)`, `watchman:reload()`. Exposed on the renderer as `window.__WATCHMAN__` via `contextBridge`.
- Electron packager config drops the `extraResources` entry that bundled `apps/backend/dist` — Mac installer shrinks and cannot accidentally boot a stale backend.

### Setup wizard `ConnectStep`

- New first step `apps/frontend/src/pages/setup/steps/ConnectStep.tsx`. Zod-validated URL input, placeholder `http://192.168.1.10:3001`.
- "Test & Save" probes `GET {url}/meta/health` with `AbortSignal.timeout(3000)`. On 200, `saveApiUrl(url)` → `reload()`.
- Gated in [[apps/frontend/src/pages/setup/SetupWizard.tsx|SetupWizard.tsx]]: when `getDesktopBridge()?.apiUrl` is empty, the wizard starts at `connect`. When already set, it starts at `welcome`.

### Offline banner

- New `apps/frontend/src/hooks/useBackendReachable.ts` polls `/meta/health` every 10s with a 3s timeout and a 3-failure threshold before flipping to offline.
- New `apps/frontend/src/components/OfflineBanner.tsx` renders a fixed-top banner with **Retry** (re-probes immediately) and **Change URL** (`saveApiUrl('')` + `reload()` → lands on `ConnectStep`). Mounted in [[apps/frontend/src/App.tsx|App.tsx]] inside `WebSocketProvider` so it persists across routes.

## Consequences

### Positive

- **Continuous polling.** Pi stays on; history has no Mac-sleep gaps.
- **Single source of truth.** DuckDB lives at `~/.watchman/data/` on the Pi; any LAN client sees the same state.
- **Thinner Mac install.** No bundled backend `dist/`; no subprocess lifecycle in Electron.
- **Portable backend.** Master-key logic in the backend itself makes it trivially runnable anywhere (systemd, dev, future deployments).
- **Predictable update loop.** `git pull && build && systemctl restart` — no Mac app rebuild required when only backend changes.

### Negative

- **Manual Pi provisioning.** First-time setup requires nvm install, clone, build, unit file. Documented but not automated.
- **Node path drift.** `nvm install` of a new minor version changes the absolute `node` path and requires editing the unit. Mitigation: symlink `~/.local/bin/node` and reference it, or use `/bin/bash -lc`.
- **No offline cache.** If the Pi is down, the Mac shows the banner and nothing else. Acceptable per user constraint.
- **Native arm64 prebuilts.** `@duckdb/node-api` must ship a Pi-compatible binary. If not, `npm install` compiles from source and needs `build-essential python3`.

### Risks

- **Data-dir permissions.** `~/.watchman/data/` must be writable by the systemd `User=pi`. Created as the `pi` user before enabling the unit.
- **Firewall.** Default Pi OS allows port 3001. Users with `ufw` enabled need `sudo ufw allow 3001/tcp`.
- **Mixed content.** Entering `https://` without a cert will fail `fetch` from `watchman://`. LAN-only http documented.
- **Backup.** `~/.watchman/data/watchman.duckdb` is the single source of truth. Operator responsibility; recommend `rsync` or `/config/export` cron.

## Alternatives Considered

| Alternative | Why Rejected |
| ----------- | ------------ |
| Keep subprocess model on Mac, add "never sleep" pmset | Treats the symptom, not the cause; laptop closed lids still block polling; doesn't enable multi-client. |
| Docker on Pi | User explicitly rejected — wants native visibility into `journalctl`, native arm64 binaries, trivial `git pull` updates, no container layer. |
| Mac Mini always-on as backend host | Viable but costs far more than a Pi and duplicates hardware the user doesn't need. |
| mDNS auto-discovery instead of manual URL entry | Adds Avahi/Bonjour complexity; single-setup manual entry is simpler and debuggable. |
| Local-backend fallback in Electron when Pi down | Conflicts with single-source-of-truth; would desync DuckDB state between hosts. User chose banner over dual-write. |

## References

- [[docs/adr/index|ADR Index]]
- [[docs/adr/016-electron-desktop-wrapper|ADR-016]] — Electron wrapper (origin of the subprocess model this ADR replaces)
- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] — LAN-only, no-auth posture this builds on
- [[docs/guides/deploying-to-raspberry-pi|Pi deploy guide]]
- [[apps/backend/src/config/masterKey.ts|masterKey.ts]]
- [[apps/backend/deploy/watchman.service|watchman.service]]
- [[apps/desktop/src/clientConfig.ts|clientConfig.ts]]
- [[apps/frontend/src/pages/setup/steps/ConnectStep.tsx|ConnectStep.tsx]]
- [[apps/frontend/src/hooks/useBackendReachable.ts|useBackendReachable.ts]]
- [[apps/frontend/src/components/OfflineBanner.tsx|OfflineBanner.tsx]]
