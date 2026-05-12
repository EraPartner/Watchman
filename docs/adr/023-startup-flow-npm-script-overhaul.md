---
title: ADR-023 Startup Flow and npm Script Overhaul
type: adr
status: accepted
date: 2026-05-12
tags: [adr, developer-experience, npm-scripts, startup, electron, distribution]
description: Consolidate startup ergonomics across desktop, production, and development modes via a single unified npm script surface inspired by Vision project patterns
aliases: [startup flows, npm scripts, developer onboarding, dev experience]
---

# ADR-023: Startup Flow and npm Script Overhaul

> [!abstract] Summary
> Refactor root npm scripts to provide three distinct startup modes (macOS Desktop install, Native production self-host, Development mode) with unified command naming, eliminate Docker dependency, introduce Playwright e2e scaffold, and add OpenAPI→TypeScript code generation for parity with the Vision project's developer ergonomics.

## Status

- **Status**: Accepted
- **Date**: 2026-05-12
- **Relates to**: [[docs/adr/016-electron-desktop-wrapper|ADR-016 Electron Desktop Wrapper]], [[docs/adr/009-frontend-technology-stack|ADR-009 Frontend Stack]]

## Context

Watchman historically used `npm` and Docker Compose for development and production. The startup experience varied:
- Desktop users: `npm run dev:desktop` (development), `npm run start:desktop` (run built app), `npm run package:desktop` (rebuild)
- Server deployments: `npm run build` + `npm run start` (vague about mode)
- Developers: `npm run dev` (but unclear which subcommands exist for partial runs)

The Vision project demonstrated a cleaner mental model with three explicit startup flows:
1. **Option A — macOS Desktop** (installed via `install.sh`)
2. **Option B — Native production self-host** (for servers)
3. **Option C — Development mode** (for contributors)

This decision consolidates Watchman's script surface to match that model, improving:
- **Discoverability**: Three clear startup flows instead of ambiguous `dev`/`start`/`package` variants
- **Contributing ergonomics**: Unified script naming (`lint`, `test`, `build` groups) vs. scattered `dev:*`/`test:*` variants
- **Cross-project familiarity**: Developers familiar with Vision immediately recognize Watchman's startup patterns
- **Elimination of Docker**: Simplifies setup for home-lab users; backend runs natively via `npm run dev:backend` or spawned by Electron
- **Test tooling**: Playwright e2e scaffold + `generate:types` script from OpenAPI for frontend TypeScript sync

## Decision

### Root `package.json` Scripts Reorganized

**Development**:
- `npm run backend` — alias for `dev:backend` (Vision parity)
- `npm run dev:frontend` — Vite dev server on port 5173
- `npm run dev:backend` — Fastify dev server on port 3001 (with nodemon auto-reload)
- `npm run dev` — both concurrently with named, colored output
- `npm run preview` — Vite production preview (local build testing)
- `npm run build:dev` — dev-mode frontend build (fast, unminified)

**Building**:
- `npm run build` — prod-mode frontend + backend (replaces scattered `build:*` tasks)
- `npm run dist` — backend + frontend build + electron-builder package (outputs `.app`, `.dmg`, `.exe`, `.appimage`)
- `npm run electron:clean` — full clean (delete `dist/`, `out/`, `node_modules/`), reinstall, build, and launch for smoke testing

**Production**:
- `npm run start` — backend + frontend preview concurrently (for prod testing on local machine)
- `npm run electron:prod` — launch pre-built Electron `.app` or `.exe` from disk
- `npm run electron:dev` — Electron with `NODE_ENV=development` (for desktop development iteration)

**Linting & Code Quality**:
- `npm run lint` — frontend ESLint (Vision parity; previously workspace-wide)
- `npm run lint:frontend` — explicit frontend lint
- `npm run lint:backend` — backend ESLint
- `npm run test` — backend Vitest (Vision parity; previously workspace-wide)
- `npm run test:frontend` — frontend Vitest
- `npm run test:watch` — backend Vitest in watch mode
- `npm run test:all` — backend + frontend Vitest concurrently
- `npm run test:coverage` — frontend coverage report (moved from workspace to frontend scope)

**Testing (E2E)**:
- `npm run test:e2e` — Playwright smoke tests (Chromium, baseURL from `VITE_FRONTEND_PORT`, auto web server)
- `npm run test:e2e:visual` — Playwright with snapshot update (`--update-snapshots`)

**Types & Code Generation**:
- `npm run generate:types` — OpenAPI spec → TypeScript types (`apps/backend/openapi.yaml` → `apps/frontend/src/types/generated.ts`) via `openapi-typescript`

### Desktop Installation Flow (macOS)

New `install.sh` at repo root:
1. Verifies Homebrew + Node.js (>= 18) presence; offers to install if missing (opt-in via `WATCHMAN_ALLOW_BREW_PIPE=1`)
2. Runs `npm install`
3. Builds desktop app via `npm run dist`
4. Copies `apps/desktop/out/Watchman.app` to `/Applications/`
5. Strips macOS quarantine attribute
6. Creates `Launch Watchman.command` shortcut at repo root for convenience

This mirrors Vision's `install.sh` pattern without Docker.

### Three Startup Flows Documented

**Option A — macOS Desktop**:
```bash
./install.sh
npm run electron:prod
```
Result: Standalone Electron app, backend auto-spawned on loopback port, master key auto-provisioned.

**Option B — Native Production Self-Host** (server):
```bash
npm install && npm run build && npm run start
```
Result: Built backend + frontend preview running concurrently on loopback. Operator can then proxy via Nginx.

**Option C — Development** (contributors):
```bash
npm install && npm run dev
```
Result: Vite + Fastify dev servers with hot reload on standard ports (5173, 3001).

### New Files

- `install.sh` — macOS desktop installer script (safe Homebrew pattern with `WATCHMAN_ALLOW_BREW_PIPE=1` opt-in)
- `apps/frontend/playwright.config.ts` — Playwright config (Chromium, baseURL from env, auto webServer)
- `apps/frontend/tests/e2e/smoke.spec.ts` — Single smoke test asserting `#root` mounted and title matches `/watchman/i`

### Root Package.json devDeps Added

- `cross-env` — Cross-platform `NODE_ENV=development` in `electron:dev` script
- `openapi-typescript` — Generate types from `openapi.yaml` in frontend
- `@playwright/test` — E2E testing (installed in `apps/frontend/package.json`)

### Code Generation Integration

`npm run generate:types` runs `openapi-typescript apps/backend/openapi.yaml -o apps/frontend/src/types/generated.ts`, ensuring:
- API changes in OpenAPI spec automatically propagate to frontend TypeScript types
- No manual type sync needed between backend and frontend
- Developers catch API contract mismatches at compile time

### Deprecated Scripts

Removed (no longer referenced in README or docs):
- `npm run dev:desktop` → replaced by `npm run electron:dev`
- `npm run start:desktop` → replaced by `npm run electron:prod`
- `npm run package:desktop` → replaced by `npm run dist`

## Consequences

### Positive

- **Three clear flows**: Developers immediately understand "desktop", "production", or "development" mode
- **Vision parity**: Familiar script naming for contributors coming from Vision project
- **Better discoverability**: Grouped script categories (Development, Building, Production, Linting, Testing) vs. flat list
- **Native backend**: No Docker Compose overhead; backend runs natively via npm or Electron spawn
- **E2E foundation**: Playwright smoke test scaffold ready for expansion
- **Type sync automation**: `generate:types` keeps frontend TypeScript in sync with OpenAPI spec
- **Improved contributing guide**: New contributors see three clear entry points instead of guessing which `dev:*` command is "the" start command

### Negative

- **Script count increased**: Root `package.json` now has ~20 scripts (vs. ~12 previously), though organized into clear groups
- **Cross-workspace coordination**: `npm run lint` and `npm run test` now only cover frontend/backend individually, not both; developers must run `test:all` to verify both
- **Breaking change for CI**: Any CI pipeline expecting `npm run lint` to lint all workspaces must be updated to use `npm run lint:frontend && npm run lint:backend`
- **Playwright not yet heavily exercised**: E2E scaffold is minimal (1 smoke test); expanding coverage requires ongoing investment

### Risks

- **Port conflicts**: If port 5173 or 3001 are in use, dev startup fails; startup fails with unhelpful error if ports are taken. Mitigation: error messages could suggest `lsof -i :5173` to diagnose.
- **Electron missing at startup**: If `dist/` was not built, `npm run electron:prod` fails silently; frontend will show "Backend unavailable". Mitigation: docs emphasize `npm run dist` as prerequisite.
- **macOS quarantine still present**: If `install.sh` xattr stripping fails (permission issues), `.app` may not launch. Mitigation: script logs xattr removal attempt; user can manually `xattr -d com.apple.quarantine /Applications/Watchman.app` if needed.
- **Env var injection complexity**: `cross-env NODE_ENV=development` may not work identically on all shells/Windows configurations. Mitigation: cross-env is well-established; Windows users should use PowerShell or WSL.

## Alternatives Considered

| Alternative | Why Rejected |
| --- | --- |
| Keep separate `dev:desktop`, `start:desktop`, `package:desktop` scripts | Inconsistent with Vision project; longer learning curve for cross-project contributors; less clear entry points for new developers. |
| Use `make` or shell script wrapper (`watchman.sh`) instead of npm scripts | npm is already the package manager; adding `make` or shell wrapper is an extra abstraction layer and potential portability issue on Windows. |
| Keep Docker Compose for production | Home-lab users prefer native setup (no Docker daemon required); backend is lightweight Node.js (no DB dependency); Electron spawned backend is simpler than Compose. |
| Ship only Electron desktop, drop production self-host mode | Some operators prefer server deployments (e.g., Raspberry Pi); Electron only on macOS/Windows leaves Linux users without desktop option; native production flow still valuable. |
| Use Vitest directly for E2E instead of Playwright | Vitest is unit/component test focused; Playwright provides cross-browser, realistic user flow testing; Playwright's UI inspector is invaluable for debugging complex flows. |
| Auto-generate TypeScript types directly in frontend build process | Centralized `npm run generate:types` command is explicit and transparent; baking into build could hide errors and add magic; explicit is better than implicit. |

## References

- [[docs/adr/016-electron-desktop-wrapper|ADR-016]] — Electron desktop app architecture
- [[docs/adr/009-frontend-technology-stack|ADR-009]] — Frontend tech (Vite, React 18)
- [[docs/guides/running-the-desktop-app|Desktop App Guide]] — Updated with new script names
- [[docs/reference/scripts|Scripts Reference]] — Complete reference of all npm commands
- [[docs/guides/setup|Setup Guide]] — Dev mode startup
- Root `package.json` — npm workspaces config with new scripts
- Root `README.md` — Three startup flows and script reference
- `install.sh` — macOS desktop installation script
- `apps/frontend/playwright.config.ts` — E2E test config
- `apps/frontend/tests/e2e/smoke.spec.ts` — Smoke test scaffold
- Vision project — Inspiration for startup flow patterns and script naming

## Related Decisions

- [[docs/adr/021-frontend-dashboard-upgrade|ADR-021]] — Frontend dashboard features (benefited by new E2E testing foundation)
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] — Backend TypeScript + Fastify (foundation for `generate:types` command)
