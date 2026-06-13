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

### Added

- Desktop: native Electron experience, runtime hardening, and a distribution
  layer (ad-hoc signed macOS `.dmg`, arm64 + x64).
- Per-location service **profiles** with automatic LAN-based switching.
- Backend resilience infra: `SnapshotCache`, `ttlMemo`, `guardedService`, and an
  SSE client, wired into the application layer.
- Liquid-glass material + observability-card UI on the frontend.
- Developer experience & repo hygiene: `.editorconfig` + `.prettierignore`
  (populated), Node version pinning (`.nvmrc` / `.node-version` / `engines`),
  `.gitattributes`, husky pre-commit (lint-staged) + pre-push (typecheck) hooks,
  `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, and this changelog.

### Changed

- Backend: shared origin policy extracted for HTTP CORS and the WebSocket upgrade.
- Backend: config store, service schema, and field metadata overhauled; service
  config now lives in the DuckDB store (legacy `{SERVICE}_*` env vars imported
  once on first boot, then ignored).
- Backend hardened across all service implementations; upgraded to Fastify 5.
- Standardized the toolchain on **Node 24** (Active LTS): CI, `.nvmrc` /
  `.node-version`, and the devcontainer now agree; `engines` requires `node >=22`.

### Fixed

- `README.md` corrected to match the implementation: trusted-network security
  model (no auth/CSRF/rate limiting), Fastify (not Express), OpenAPI 3.1 with no
  Swagger UI served, and the real backend env surface (`WATCHMAN_MASTER_KEY`,
  `CORS_ALLOWED_ORIGINS`).

### Security

- Adopted a documented **trusted-network, single-user** security model — no auth,
  CSRF, or rate limiting by design (see ADR-017 / ADR-025 and `SECURITY.md`).
- Patched Dependabot-flagged dependencies across both lockfiles.

[unreleased]: https://github.com/EraPartner/Watchman/commits/main
