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

- Adding a service: the dashboard tile now appears right after saving. The
  `service_config_changed` WebSocket frame is sent once the backend has brought
  the service up, not before, so the client's `/instances` refetch no longer
  misses it and waits for the 60-second poll.
- Adding a service: list fields (router ports, interface filter, Roon ports)
  accept a comma, so more than one value can be typed.
- Adding a service: the Alby Hub form no longer pre-ticks "Legacy probe mode",
  so UI-added hubs use the NWC API like the schema default.
- Adding a Hue bridge: the form has a **Pair with bridge** button that fills the
  application key and cert pin. Pairing now runs over a client pinned to the
  bridge's cert; before, it used CA verification, which the bridge's
  self-signed cert always fails.
- SSH key paths (Mac Mini, Raspberry Pi) and the Tor cookie file accept `~/…`.
- Roon: "Use Roon API" declares the transport service when registering with the
  Core, as Roon's extension API requires; without it the zone subscription got
  no data. Not verified against a live Roon Core.
- Adding a service: a rejected config shows `field: problem` messages instead
  of the raw validation JSON.
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
