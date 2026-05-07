---
title: Revert Split Deploy + Remove Time-Series History
type: adr
status: proposed
date: 2026-05-07
tags: [adr, scope-reduction, time-series, raspberry-pi, electron, simplification, scope-revert]
description: Drop persistent time-series history and revert the Raspberry Pi split deploy; restore the Mac-only Electron + embedded backend model and run the dashboard as a single, in-process application
aliases: [ADR-019, scope revert, drop history, drop pi, simplification]
---

# ADR-019: Revert Split Deploy + Remove Time-Series History

> [!abstract] Summary
> Remove the persistent time-series layer (DuckDB writer, rollup worker, history reader, history HTTP route, frontend chart) and revert the Raspberry Pi split deploy introduced in [[docs/adr/018-split-deploy-pi-backend|ADR-018]]. Watchman returns to a Mac-only Electron app with an embedded backend subprocess: one binary, one process tree, one Mac, no Pi, no SSH, no systemd, no DuckDB time-series store. Aligns the project with its original brief: "one dashboard instead of ten browser tabs."

## Status

- **Status**: Accepted
- **Date**: 2026-05-07
- **Supersedes**: [[docs/adr/018-split-deploy-pi-backend|ADR-018]] (split deploy)
- **Partially supersedes**: [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] (time-series half — bento design system is unaffected)
- **Restores**: [[docs/adr/016-electron-desktop-wrapper|ADR-016]] (subprocess model) as the canonical deployment

## Context

Watchman started as a single-purpose dashboard that surfaces health and stats from LAN services in one place, replacing 10+ browser tabs. Two later additions expanded the scope significantly:

1. **[[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] — Persistent time-series.** Introduced DuckDB-backed history: `TimeSeriesWriter`, `RollupWorker`, `TimeSeriesReader`, schema/migrations, `GET /services/:kind/history`, and frontend `HistoryChart` + `RangePicker` + `useServiceHistory`. Roughly 735 lines of backend code plus matching frontend.

2. **[[docs/adr/018-split-deploy-pi-backend|ADR-018]] — Raspberry Pi split deploy.** Moved the backend out of the Electron subprocess onto an always-on Pi under systemd. The stated motivation in ADR-018 is *"When the Mac slept, the poller stopped. History gaps appeared in the time-series for every service."* The Pi exists to keep DuckDB writing 24/7. It is a downstream consequence of the time-series feature, not an independent need.

Operational reality after these additions:

- Two physical hosts (Pi + Mac), each with its own failure mode (DHCP/IP drift, nvm Node version pin, systemd unit drift, firewall, arm64 native binary builds for `@duckdb/node-api`).
- Setup-wizard "Connect" step + offline banner + URL pairing + `useBackendReachable` polling — all only needed because the backend is on a different machine.
- Master-key bootstrap moved into the backend (good in itself) but only because Electron no longer provisions it.
- Single user, single Mac client. Multi-client never used. "Single source of truth across LAN" is theoretical.
- DuckDB native binary adds platform-specific install pain, especially on Pi arm64 without prebuilts.

The user has decided that continuous historical charts are not worth the operational and code-complexity tax, and prefers a single-host, single-process model.

## Decision

### Remove time-series persistence end-to-end

Backend:

- Delete `apps/backend/src/infra/timeseries/` (`DuckDbPool` is retained — see "ConfigStore" below — but the time-series-only files are removed: `TimeSeriesWriter.ts`, `TimeSeriesReader.ts`, `RollupWorker.ts`, `migrations.ts`, `schema.sql`, `duckdbTime.ts`, `timeseries.test.ts`).
- Delete `apps/backend/src/application/GetServiceHistory.ts`.
- Delete `apps/backend/src/transport/http/routes/history.ts`.
- Strip the time-series bootstrap block, `TIMESERIES_ENABLED` branch, `historyRoutes` registration, and `history` field on `BuildServerDeps` from [[apps/backend/src/index.ts|index.ts]] and [[apps/backend/src/transport/http/server.ts|server.ts]].
- Remove `TIMESERIES_ENABLED` from [[apps/backend/src/config/env.ts|env.ts]] and `.env.example`.
- Drop the `/services/{kind}/history` operation from [[apps/backend/openapi.yaml|openapi.yaml]].

Frontend:

- Delete `apps/frontend/src/components/detail/HistoryChart.tsx`.
- Delete `apps/frontend/src/components/detail/RangePicker.tsx`.
- Delete `apps/frontend/src/hooks/useServiceHistory.ts`.
- Remove `HistoryChart` + `RangePicker` usage from `ServiceDetailSheet.tsx`; collapse the "Charts" tab or replace with a recent-activity sparkline driven from the in-process cache (see below).
- Remove the history endpoint from `apps/frontend/src/services/apiClient/endpoints.ts` and the `history` query key from `apps/frontend/src/lib/queryKeys.ts`.
- Drop `@visx/*` and `d3-array` from `apps/frontend/package.json` if no other consumer remains.

In-memory recent-activity buffer (replacement for the chart): the existing in-process cache at `apps/backend/src/infra/cache/` already retains the last poll result per service. Extend it to keep an N-sample ring buffer (e.g. 100 samples) per `(kind, instance, metric)` and expose a single endpoint `GET /services/:kind/recent?metric=...&instance=...` returning the buffer. Lost on restart, no persistence, no rollups, no DuckDB.

### Revert the Raspberry Pi split deploy

Backend:

- Delete `apps/backend/deploy/watchman.service`.
- Keep [[apps/backend/src/config/masterKey.ts|masterKey.ts]] in the backend — it works for both subprocess and standalone modes and removing it has no benefit.

Electron desktop client:

- Restore `apps/desktop/src/backend.ts` and `apps/desktop/src/freePort.ts` from git history at commit `9853720~1`.
- Restore subprocess spawn lifecycle in `apps/desktop/src/main.ts` (start backend with `BACKEND_V2_HOST=127.0.0.1` + acquired free port + `DATA_DIR=<userData>/data`, health-check + graceful shutdown).
- Delete `apps/desktop/src/clientConfig.ts`. Drop `watchman:saveApiUrl`, `watchman:getApiUrl`, `watchman:reload` IPC handlers; the renderer reads `apiUrl` from `additionalArguments` as in [[docs/adr/016-electron-desktop-wrapper|ADR-016]].
- Restore `extraResources` for `apps/backend/dist/` in `apps/desktop/electron-builder.yml`.

Frontend:

- Delete `apps/frontend/src/pages/setup/steps/ConnectStep.tsx`.
- Delete `apps/frontend/src/components/OfflineBanner.tsx`.
- Delete `apps/frontend/src/hooks/useBackendReachable.ts`.
- Remove the `connect` step from `apps/frontend/src/pages/setup/SetupWizard.tsx`; setup starts at `welcome`.
- Revert `apps/frontend/src/lib/backendUrl.ts` to the subprocess shape: read `apiUrl`/`wsUrl` from `additionalArguments`, no `saveApiUrl`/`reload`.
- Remove `<OfflineBanner />` from `App.tsx`.

### ConfigStore: keep DuckDB, scope unchanged in this ADR

`ConfigStore` currently persists service configuration in DuckDB at `<DATA_DIR>/watchman.duckdb` and re-uses the same `DuckDbPool` as the (now-removed) time-series layer. Rather than do a second migration in the same change, **keep DuckDB for ConfigStore** and remove only the time-series tables/migrations. The DuckDB native dependency stays for the moment.

A follow-up ADR may migrate ConfigStore to a plain JSON file at `<DATA_DIR>/config.json` (no native binary, no SQL, no pool). That decision is deferred.

### Documentation

- Mark [[docs/adr/018-split-deploy-pi-backend|ADR-018]] **Superseded by ADR-019**.
- Mark [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] **Partially superseded** with a note that the bento design system is retained but the DuckDB time-series subsystem was removed in ADR-019.
- Mark [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] unchanged: single-user no-auth posture is still correct.
- Delete `docs/guides/deploying-to-raspberry-pi.md`, `docs/guides/running-the-setup-wizard.md` (rewrite as short note in `docs/guides/running-the-desktop-app.md`).
- Update `docs/INDEX.md`, `docs/adr/index.md`, `docs/integrations/raspberry-pi.md` (Pi-as-monitored-service still supported; Pi-as-host is removed), `docs/architecture/index.md`, `docs/api/index.md` (remove `services-health` history reference if present), and `docs/components/service-detail-sheet.md`.

## Consequences

### Positive

- **One process, one machine, one bundle.** Same model as ADR-016. Mac install runs end-to-end on the user's laptop with no LAN coordination.
- **No Pi operations.** No nvm pin, no systemd unit, no DHCP reservation, no firewall rule, no SSH troubleshooting, no `journalctl`, no native arm64 build pain.
- **Smaller code surface.** ~1,000+ lines deleted across backend + frontend (time-series infra, history route + use-case, history chart + range picker + hook, setup ConnectStep, offline banner + reachability hook, Electron client config + IPC, Pi systemd unit + deploy guide).
- **Faster dev loop.** No need for a Pi to test polling; `npm run dev` boots the entire stack on the Mac.
- **Smaller installer.** No DuckDB native binary in the path is a follow-up; for now, removing time-series alone shrinks the working set.
- **Original brief restored.** "One dashboard instead of ten tabs" — Electron + subprocess does this well and was the answer in ADR-016.

### Negative

- **No persistent history.** Lose 24-hour / 7-day uptime trends, latency-over-time charts, and the time-series chart in `ServiceDetailSheet`. Recent-activity ring buffer (~last 100 polls) is the only retained signal and is lost on restart.
- **Mac-sleep gaps.** When the Mac sleeps, polling stops. Acceptable per the user's stated preference (this was the original ADR-018 motivation; user accepts dropping it).
- **No multi-client.** Other LAN devices cannot point at a shared backend. The user has only ever run a single Mac client; non-issue.
- **Doc churn.** A meaningful portion of docs was written for the split-deploy model and must be deleted or rewritten.

### Risks

- **Stale wikilinks.** ADR-018 added 30+ docs and updated 100+ links; reverting those without leaving dangling links requires the `watchman-kb-updater` agent to sweep.
- **Hidden coupling.** If something added since ADR-014 quietly depends on `tsWriter` or the history endpoint outside the obvious surface, removing it could break a screen. Mitigated by `npm run typecheck` + workspace tests + manual smoke of `ServiceDetailSheet`.
- **DuckDB removal half-done.** ConfigStore still uses DuckDB; the dependency stays. Some users might expect "drop history" to also remove DuckDB entirely. Documented as a deferred follow-up (Phase 2).

## Alternatives Considered

| Alternative | Why Rejected |
| ----------- | ------------ |
| Keep history but move it back into Electron subprocess (DuckDB on Mac, accept sleep gaps) | Sleep gaps make the chart misleading rather than useful; user already decided history isn't worth the cost. |
| Keep Pi but drop history | Pi exists *because* of history (per ADR-018 itself). Without history there is no reason to run on a Pi — one Mac is enough. |
| Drop Pi + keep history on Mac with periodic SQLite/file persistence | Reintroduces persistence complexity for a feature the user has decided not to keep. |
| Migrate ConfigStore to JSON file in the same ADR | Doubles the change surface; better as a follow-up once the time-series + Pi revert is stable. |
| Keep everything, mark project "complete", stop adding features | Doesn't reduce ongoing maintenance cost; doesn't address the user's expressed dissatisfaction with current direction. |

## References

- [[docs/adr/index|ADR Index]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]] — original time-series + bento decision (partially superseded)
- [[docs/adr/016-electron-desktop-wrapper|ADR-016]] — Electron + embedded backend model (restored)
- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] — single-user no-auth posture (unchanged)
- [[docs/adr/018-split-deploy-pi-backend|ADR-018]] — Pi split deploy (superseded)
- [[apps/backend/src/index.ts|backend index.ts]] — bootstrap to be trimmed
- [[apps/backend/src/transport/http/server.ts|server.ts]] — remove `historyRoutes` registration
- [[apps/desktop/src/main.ts|desktop main.ts]] — restore subprocess lifecycle
- [[apps/frontend/src/components/detail/ServiceDetailSheet.tsx|ServiceDetailSheet.tsx]] — remove HistoryChart + RangePicker

## Follow-ups (deferred, not part of this ADR)

- ADR-020 (proposed): migrate ConfigStore from DuckDB to JSON file. Removes `@duckdb/node-api` entirely.
- TODO: re-evaluate whether the recent-activity ring buffer is even worth keeping; if `ServiceDetailSheet` reads as well without any chart, delete it too.
