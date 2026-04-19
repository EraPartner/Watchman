---
title: ADR-015 UI-Driven Service Configuration
type: adr
status: accepted
date: 2026-04-19
tags: [adr, configuration, duckdb, encryption, hot-reload]
description: Move service configuration from .env into DuckDB with encrypted secrets, UI CRUD, and hot-reload.
aliases: [adr-015, ui config]
---

# ADR-015: UI-Driven Service Configuration

> [!abstract] Summary
> Services are managed from the UI and stored in DuckDB with AES-256-GCM encrypted secrets; env retains only bootstrap (ports, DATA_DIR, auth, master key).

## Status

- **Status**: Accepted
- **Date**: 2026-04-19

## Context

Previously every service instance was defined via `.env` (`ENABLED_SERVICES`, per-kind URLs/creds, and `WATCHMAN_SERVICES_CONFIG` JSON). Adding, editing, or disabling a service required editing files and restarting the backend — hostile to non-technical self-hosters and shell-free deployments. We need runtime CRUD with persistence, safe secret storage, and live reload without losing the simplicity of an env-only bootstrap.

## Decision

- **Storage**: DuckDB tables `app_service_instance` + `app_config_audit`. Non-secret fields in `config_public` JSON; secret fields in `config_secret` BLOB.
- **Secrets**: AES-256-GCM keyed by `WATCHMAN_MASTER_KEY` env (32 bytes, base64). Layout `IV(12) || TAG(16) || ciphertext`. GET responses redact secret fields to `"***"`.
- **Schemas**: one Zod schema + field metadata file per kind under `src/config/schemas/`, re-exported for the API to drive dynamic UI forms.
- **Hot reload**: `ServiceLifecycle` (mutex-serialized) subscribes to `config:service.{created,updated,deleted}`. On change: poller `pause()` → `onStop` old → rebuild via `ServiceFactory` → `onStart` → poller `retrack` → `resume`. WS broadcasts reduced events for frontend refresh.
- **Bootstrap**: setup wizard served when `app_service_instance` empty. Admin credentials remain env (`AUTH_USERNAME`, `AUTH_PASSWORD_HASH`) for this round.
- **Migration**: first boot with empty table + legacy env vars imports once via `envMigrator`, logs a warning on subsequent boots if legacy vars still set.
- **API**: `GET/POST/PUT/DELETE /api/v1/config/services`, `POST /config/services/:id/test`, `GET /config/kinds`, `GET /config/audit`, `GET /config/export`, `POST /config/import`, `GET /setup/status`. All auth-gated except `/setup/status`.
- **Audit**: every create/update/delete/import/export writes redacted diff + actor to `app_config_audit`, surfaced in a timeline UI.
- **Backup/Restore**: Export endpoint returns AES-256-GCM encrypted bundle of all configs for backup/migration. Import endpoint upserts services by `(kind, instanceId)` from bundle, with progress reporting.

## Consequences

### Positive

- Admins manage services from the UI without shell access or restarts.
- Secrets encrypted at rest; plaintext never returned after save.
- Per-kind Zod schemas give typed validation on backend and form metadata on frontend from one source.
- Audit trail for every config mutation.

### Negative

- New operational dependency: `WATCHMAN_MASTER_KEY` must be set and preserved. Losing it makes all secrets unrecoverable.
- Two sources of truth during migration window (env + DB); legacy env vars for services are ignored post-migration.
- Hot-reload adds concurrency risk (mitigated by mutex + poller pause).

### Risks

- Master-key loss ⇒ full secret re-entry. Documented loudly in wizard + `.env.example`.
- Broken kind schema ships ⇒ existing rows fail to load. Schemas are versionless; use additive changes and tolerate unknown fields on read.
- Test-connection may hit real upstreams with creds — scoped to authed admin only.

## Alternatives Considered

| Alternative | Why Rejected |
| ----------- | ------------ |
| Keep env-only config | Blocks the primary UX goal (UI CRUD, no shell). |
| SQLite for config | Already run DuckDB for time-series; avoid second embedded DB. |
| KMS / OS keychain for secrets | Heavier ops burden for self-hosters; master-key env is portable. |
| Restart-on-change instead of hot-reload | Breaks WebSocket sessions and tile state on every edit. |

## References

- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/features/ui-configuration|Feature: UI Configuration]]
- [[docs/api/config|API: Config]]
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]]
- Related code: `apps/backend/src/config/store/`, `apps/backend/src/application/ServiceLifecycle.ts`, `apps/backend/src/transport/http/routes/config.ts`, `apps/frontend/src/pages/Settings/`
