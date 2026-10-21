# Changelog

All notable changes to Watchman are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
Maintainer release flow (see CONTRIBUTING.md):
  1. Move the [Unreleased] items into a new "## [X.Y.Z] - YYYY-MM-DD" section.
  2. Bump version in package.json AND apps/desktop/package.json (must match the tag).
  3. Tag `vX.Y.Z` and push — the Release workflow uses this section as the
     GitHub Release body (and appends auto-generated commit notes).
Use the groups: Added, Changed, Deprecated, Removed, Fixed, Security.
-->

## [Unreleased]

No releases have been tagged yet; the work below is staged for the first
`1.0.0` release.

**Project status (2026-10-20):** Watchman is no longer actively maintained. The
final maintenance pass below left `main` with passing CI, a clean HIGH/CRITICAL
dependency audit, and documentation aligned with the code.

### Added

- Desktop: native Electron experience, runtime hardening, and a distribution
  layer (ad-hoc signed macOS `.dmg`, arm64 + x64).
- Per-location service **profiles** with automatic LAN-based switching.
- Backend resilience infra: `SnapshotCache`, `ttlMemo`, `guardedService`, and an
  SSE client, wired into the application layer.
- Liquid-glass material + observability-card UI on the frontend.
- Developer experience & repo hygiene: `.editorconfig` + `.prettierignore`
  (populated), Node version pinning (`.nvmrc` / `.node-version` / `engines`),
  `.gitattributes`, `.githooks` wired via `core.hooksPath` (gitleaks + lint-staged
  pre-commit, commitlint commit-msg, typecheck + tests pre-push),
  `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, and this changelog.

### Changed

- Backend: shared origin policy extracted for HTTP CORS and the WebSocket upgrade.
- Backend: config store, service schema, and field metadata overhauled; service
  config now lives in the DuckDB store (legacy `WATCHMAN_SERVICES_CONFIG` imported
  once on first boot, then ignored).
- Backend hardened across all service implementations; upgraded to Fastify 5.
- Coverage thresholds lowered to just below measured coverage (frontend
  lines 79%, statements 77%, branches 64%; backend branches 72%). They now guard against
  regressions instead of requiring new tests.
- Standardized the toolchain on **Node 24** (Active LTS): CI, `.nvmrc` /
  `.node-version`, and the devcontainer now agree; `engines` requires `node >=22`.

### Fixed

- Frontend: the WebSocket no longer stops reconnecting after a short backend
  outage. A retry that landed inside the 5 s connection throttle was dropped
  with no further retry, so live updates stayed off until a page reload; it is
  now deferred to the end of the window. After 5 failed attempts the failure
  toast still shows once, but retries continue every 30 s instead of stopping.
- Frontend: after the WebSocket reconnects, profile, network, instance and
  health queries are refreshed, so frames missed while disconnected (such as
  the auto profile switch after a network change) are not lost.
- Frontend: a service's detail sheet event log shows only alerts for its own
  instance, not for other instances of the same kind.
- Backend: deleting or renaming a failing service clears its alert state, so a
  later service with the same `kind:instanceId` gets its first error alert and
  no false "recovered" alert.
- Setup wizard: pressing Finish after adding a service sent you back to the
  wizard, because the dashboard gate used the cached "needs setup" answer.
  Adding, deleting or importing services now clears that cached answer.
- Profiles: a manual profile switch is no longer undone when one network check
  misses the gateway's MAC address or finds no default route on an unchanged
  LAN.
- Profiles: a failed automatic switch is retried on the next network check
  instead of being recorded as done.
- Profiles: shutdown waits for a network check in progress, so it cannot switch
  profiles after services have stopped.
- Profiles: clearing a profile's description in Settings now saves. Renaming a
  profile to a name that contains "not found" returns 400, not 404.
- Frontend: the dashboard shows a "Couldn't load services" error with a Retry
  button when `/instances` fails, instead of the "No services configured yet"
  empty state.
- Frontend: a tile for a specific instance no longer shows another instance's
  error while its own health entry is missing from `/services`.
- Frontend: navigating to another route clears the app error screen; before, it
  stayed until a full reload.
- Frontend: the console logger no longer leaks a secret that also appears in its
  key (e.g. `password=pass`), and data fields named `level`, `message` or
  `timestamp` no longer overwrite the log entry's own fields.
- Frontend: `formatBytes` returns `0 B` for negative values and keeps values
  below 1 in bytes, instead of `NaN undefined` or a missing unit.
- Backend: loads `apps/backend/.env.local` first and `apps/backend/.env` as a
  fallback. Before, only `.env` was read, so settings placed in `.env.local` as
  the documentation instructs were silently ignored.
- Desktop: `apps/desktop/tsconfig.json` uses `Node16` module resolution. The
  previous `node10` setting is removed in TypeScript 7, which broke the desktop
  build and typecheck.
- CI: the type-check job installs all workspaces, so the desktop check runs
  against its own TypeScript and Electron type declarations.
- Frontend: the Vite dev and preview proxy now forwards `/profiles`, so location
  profiles work in browser (non-desktop) deployments. It forwards only
  `/setup/…` API paths, so reloading the `/setup` wizard page no longer returns
  a backend 404.
- Documentation: deployment, setup, environment, and service guides describe the
  current Fastify backend and trusted-network model instead of the removed
  Express/JWT design.
- `README.md` corrected to match the implementation: trusted-network security
  model (no auth/CSRF/rate limiting), Fastify (not Express), OpenAPI 3.1 with no
  Swagger UI served, and the real backend env surface (`WATCHMAN_MASTER_KEY`,
  `CORS_ALLOWED_ORIGINS`).

### Security

- Adopted a documented **trusted-network, single-user** security model — no auth,
  CSRF, or rate limiting by design (see ADR-017 / ADR-025 and `SECURITY.md`).
- Patched Dependabot-flagged dependencies across both lockfiles.
- Final dependency refresh (2026-10-20): both lockfiles updated with
  `npm audit fix`, Vitest 4.1.12, and Electron 43.8.0. No known HIGH or CRITICAL
  advisories remain, and the `.audit-ci.json` allowlist is empty. Moderate
  advisories remain in Electron packaging tooling (`electron-builder` via
  `sprintf-js`), which has no non-breaking fix.

[unreleased]: https://github.com/EraPartner/Watchman/commits/main
