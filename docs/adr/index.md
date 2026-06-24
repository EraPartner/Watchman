---
title: Architecture Decision Records
type: index
status: active
date: 2026-06-13
tags: [adr, architecture, index, decision, design, startup-flows]
description: Index of all Architecture Decision Records for the Watchman project - why design choices were made
aliases: [adr index, decisions, architecture decisions, design decisions]
---

# Architecture Decision Records

> [!abstract] Purpose
> ADRs capture significant architectural decisions, their context, and consequences. Check these before making design changes.
>
> **For AI Agents**: Always read relevant ADRs before making architectural changes.

## ADR Index

```dataview
TABLE WITHOUT ID file.link AS "Decision", date AS "Date", status AS "Status", tags AS "Tags"
FROM "docs/adr"
WHERE type = "adr"
SORT file.name ASC
```

## ADR Categories

| Category                                                               | Description                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [[docs/adr/001-monorepo-npm-workspaces.md                              | Monorepo]]                                            | npm workspaces structure                                                                                                                                                                                                                                                                                                                                                     |
| [[docs/adr/002-service-factory-pattern.md                              | Service Factory]]                                     | Service instantiation pattern                                                                                                                                                                                                                                                                                                                                                |
| [[docs/adr/003-central-service-orchestration.md                        | ServiceManager]]                                      | Central orchestration                                                                                                                                                                                                                                                                                                                                                        |
| [[docs/adr/004-layered-security-middleware.md                          | Security]]                                            | Security middleware layers                                                                                                                                                                                                                                                                                                                                                   |
| [[docs/adr/005-real-time-websocket.md                                  | WebSocket]]                                           | Real-time updates                                                                                                                                                                                                                                                                                                                                                            |
| [[docs/adr/006-request-optimization-batching.md                        | Optimization]]                                        | Request batching                                                                                                                                                                                                                                                                                                                                                             |
| [[docs/adr/007-api-client-retry-error-handling.md                      | API Client]]                                          | Frontend API client                                                                                                                                                                                                                                                                                                                                                          |
| [[docs/adr/008-configuration-environment-variables.md                  | Config]]                                              | Environment-based config                                                                                                                                                                                                                                                                                                                                                     |
| [[docs/adr/009-frontend-technology-stack.md                            | Frontend Stack]]                                      | React, TypeScript, Vite                                                                                                                                                                                                                                                                                                                                                      |
| [[docs/adr/010-graceful-shutdown-process-management.md                 | Graceful Shutdown]]                                   | Process management                                                                                                                                                                                                                                                                                                                                                           |
| [[docs/adr/011-dynamic-route-generation.md                             | Dynamic Routes]]                                      | Service route generation                                                                                                                                                                                                                                                                                                                                                     |
| [[docs/adr/012-backend-framework-module-system.md                      | Module System]]                                       | ESM module system                                                                                                                                                                                                                                                                                                                                                            |
| [[docs/adr/013-backend-rewrite-typescript-fastify.md                   | Backend Rewrite]]                                     | TypeScript + Fastify 4 + in-process state                                                                                                                                                                                                                                                                                                                                    |
| [[docs/adr/014-time-series-duckdb-and-bento-design-system.md           | Time-Series + Bento]]                                 | DuckDB + time-series backend + bento design frontend                                                                                                                                                                                                                                                                                                                         |
| [[docs/adr/015-ui-driven-service-configuration.md                      | UI Configuration]]                                    | UI-driven CRUD with DuckDB + encrypted secrets + hot-reload                                                                                                                                                                                                                                                                                                                  |
| [[docs/adr/016-electron-desktop-wrapper.md                             | Electron Desktop Wrapper]]                            | Custom watchman:// protocol, auto-spawned backend, per-install master key                                                                                                                                                                                                                                                                                                    |
| [[docs/adr/017-remove-authentication-frontend-v2-migration.md          | Auth Removal + Frontend v2 Migration]]                | Single-user posture, removed JWT/CSRF auth, frontend v2 envelope contract, port 3101→3001                                                                                                                                                                                                                                                                                    |
| [[docs/adr/018-split-deploy-pi-backend.md                              | Split Deploy — Pi Backend]]                           | Always-on Raspberry Pi backend under systemd + thin Electron client; LAN-only, no TLS, offline banner on Pi unreachable (**superseded by ADR-019**)                                                                                                                                                                                                                          |
| [[docs/adr/019-revert-split-deploy-and-remove-time-series.md           | Revert Split Deploy + Remove Time-Series]]            | Drop persistent history (DuckDB time-series, history route, history chart) and revert Pi split deploy; restore Mac-only Electron + embedded backend                                                                                                                                                                                                                          |
| [[docs/adr/019-two-tier-health-and-monitoring-upgrades.md              | Two-Tier Health + Monitoring Upgrades]]               | Universal ICMP layer in `BaseService` (host vs service tier) + per-service methodology upgrades (Tor ControlPort, router SNMP, Hue API v2, Bitcoin ZMQ, Synology DSM API, Roon WebSocket, Homebridge Config UI X)                                                                                                                                                            |
| [[docs/adr/020-service-monitoring-methodology.md                       | Service Monitoring Methodology]]                      | Two-layer probe model: shared `ReachabilityProbe` (ICMP + TCP) baseline + per-service deep probe; replace external Onionoo with local Tor control-port; drop Mac Mini SSH bounce for Pi; structured `sysctl`/`vm_stat` for Mac Mini                                                                                                                                          |
| [[docs/adr/021-frontend-dashboard-upgrade.md                           | Frontend Dashboard Upgrade]]                          | Aggregated `/services` fan-out for tile health, client-side metric history ring buffer, sparklines on tiles + detail-sheet charts, editorial top-bar nav with global summary chip, quickLink on every renderer, Raw + Config + custom panels in detail sheet                                                                                                                 |
| [[docs/adr/022-instance-id-rename.md                                   | Instance ID Rename Support]]                          | Allow renaming service instances in-place with audit trail and dedicated lifecycle event                                                                                                                                                                                                                                                                                     |
| [[docs/adr/023-startup-flow-npm-script-overhaul.md                     | Startup Flow & npm Script Overhaul]]                  | Three startup modes (Desktop, Production, Development), unified npm script surface, Playwright e2e scaffold, OpenAPI→TypeScript generation                                                                                                                                                                                                                                   |
| [[docs/adr/024-claude-code-devcontainer.md                             | Claude Code Devcontainer]]                            | Hardened Docker devcontainer with iptables default-deny egress, non-root user, Keychain-backed auth, volume-isolated ~/.claude, and host ssh-agent forwarding for `--dangerously-skip-permissions` mode (**superseded by ADR-030**)                                                                                                                                          |
| [[docs/adr/025-trusted-network-security-model-and-audit-remediation.md | Trusted-Network Security Model + Audit Remediation]]  | Reaffirm no-auth single-user posture with shared origin allow-list (CORS + WS), browser-compatible WebSocket gate, wire breaker/SWR-cache/ZMQ/GPIO instead of deleting, canonical camelCase service kinds, docs/spec corrected to match code                                                                                                                                 |
| [[docs/adr/026-reachability-derivation-and-telemetry-scope.md          | Reachability Derivation Invariant + Telemetry Scope]] | Fix `withHostPing` to derive `HealthSnapshot.reachable` from the service tier alone for daemon-primary services (was `host AND service`); confirm non-persistent, in-session-only telemetry scope (no Prometheus, no server-side history), reaffirming ADR-019                                                                                                               |
| [[docs/adr/027-service-profiles-and-network-auto-switch.md             | Service Profiles + Network Auto-Switch]]              | Named per-location profiles owning disjoint service sets; server-authoritative single active profile gates which services are monitored; LAN auto-switch by default-gateway MAC with manual override; strict model with auto-created Default profile + backfill                                                                                                              |
| [[docs/adr/028-liquid-glass-observability-tiles.md                     | Liquid-Glass + Observability Tiles]]                  | Apple-inspired liquid-glass material layer (frosted `.glass-*` utilities + `backdrop-filter` saturate) and a static gold-wash/blueprint-grid atmosphere; service tiles redesigned as observability cards (icon watermark + full-bleed signal chart + state-aware hero); Sparkline rewrite; palette/fonts/grid unchanged; full reduced-transparency/contrast/motion fallbacks |
| [[docs/adr/029-desktop-native-experience-and-distribution.md           | Desktop Native Experience + Distribution]]            | Native-app polish/hardening/release layer on the ADR-016 Electron wrapper (runtime model unchanged): app icon, macOS hiddenInset + vibrancy, window-state persistence, boot splash, error/recovery screen, health watchdog, native menus; CSP on `watchman://` + navigation allow-list + deny-all permissions; DMG/zip + checksums + GitHub publish + corrected install.sh   |
| [[docs/adr/030-devcontainer-apple-container-runtime.md                 | Devcontainer Apple/Container Runtime]]                | Migrate the Claude sandbox off Docker / Docker-Compose / the devcontainer CLI onto Apple's native `container` runtime (host launcher `bin/claude`: `container build`/`run`/`exec`); same hardened image, squid SNI hostname allowlist + iptables egress lock, mounts, lifecycle, Keychain auth preserved (**supersedes ADR-024**)                                            |

## Creating a New ADR

1. Copy [[docs/adr/template|ADR Template]]
2. Name it `NNN-short-title.md` (next sequential number after 025)
3. Fill in all sections:
   - **Status**: Proposed | Accepted | Deprecated | Superseded
   - **Context**: The problem being solved
   - **Decision**: What was chosen
   - **Consequences**: Positive, negative, and risks
   - **Alternatives Considered**: What else was evaluated
4. Update this index

## When to Create an ADR

Create an ADR when making significant changes that affect:

- Project structure or architecture
- API design or endpoints
- Security model
- Technology choices
- Service patterns
- Build/deployment process

For small fixes or incremental improvements, documentation in code comments is sufficient.

## Related

- [[docs/architecture/index|Architecture Overview]]
- [[docs/guides/contributing|Contributing Guide]]
- [[docs/guides/ai-agent-workflow|AI Agent Workflow]]
