---
title: ADR-022 Instance ID Rename Support
type: adr
status: accepted
date: 2026-05-12
tags: [adr, architecture, configuration, audit]
description: Permit renaming a service instance id after creation, with validation, audit trail, and a dedicated lifecycle event.
aliases: [instance rename, rename instance, service id rename]
---

# ADR-022: Instance ID Rename Support

> [!abstract] Summary
> Instance ids of stored services are now mutable. A rename is validated, uniqueness-checked, persisted, audited, and emitted as a dedicated `config:service.renamed` event so subscribers can react explicitly.

## Status

- **Status**: Accepted
- **Date**: 2026-05-12
- **Relates to**: [[docs/adr/015-ui-driven-service-configuration|ADR-015 UI-driven Service Configuration]]

## Context

ADR-015 introduced UI-driven configuration of service instances keyed by `(kind, instanceId)`. The original Settings editor disabled the `instanceId` input for existing instances, treating the id as effectively immutable. Operators asked for the ability to rename an instance (e.g. `qbittorrent/main` → `qbittorrent/seedbox`) without deleting and recreating, which would also drop in-memory history.

The previous implicit "immutable" assumption was never enforced by validation in the store layer. The unique index `(kind, instance_id)` was the only safeguard.

## Decision

1. **Frontend**: `ServiceEditor` keeps the `instanceId` input enabled in edit mode. The form validates the id against `/^[a-z0-9][a-z0-9-]*$/`, max 64 chars. A "rename will reset in-memory metric history" hint appears whenever the id differs from the saved value.
2. **Backend (`ConfigStore.update`)**:
   - Validates the new instance id with the same regex / length rule.
   - If renamed, performs a same-kind uniqueness check excluding the current row id.
   - Writes a dedicated audit row with `action: 'rename'` and `diff: { from, to }` in addition to the standard `update` audit row.
   - Emits `config:service.renamed` (`{ id, kind, oldInstanceId, newInstanceId }`) after the regular `config:service.updated`.
3. **Service lifecycle**: No change needed. `applyUpdate` is keyed by stored row id (UUID) which is stable across renames. Teardown uses the previous in-memory service id (`kind:oldInstanceId`); `bringUp` then re-registers under the new id (`kind:newInstanceId`).

## Consequences

### Positive

- Operators can rename instances in-place, preserving cached secrets and stored row identity.
- Audit history makes renames first-class events for compliance.
- The dedicated `config:service.renamed` event lets subscribers (frontend, alerting, metrics) discriminate renames from generic updates.

### Negative

- The frontend in-memory metric history (`apps/frontend/src/lib/metricHistory.ts`) is keyed by `(kind, instanceId)`, so renaming resets that buffer. The UI surfaces this explicitly.
- The `AuditEntry.action` union grows by one variant. Existing audit consumers must allow an unknown action variant or be updated.

### Risks

- A subscriber that only reacts to `config:service.updated` is fine because lifecycle teardown is keyed by stored row id. A subscriber that only reacts to `config:service.renamed` would miss other updates - subscribers should treat renames as a refinement of updates, not a replacement.

## Alternatives Considered

| Alternative | Why Rejected |
| ----------- | ------------ |
| Continue treating instance ids as immutable (require delete + recreate) | Loses cached secret values, breaks user mental model, makes harmless renames destructive. |
| Use a separate `PATCH /config/services/{id}/rename` endpoint | Adds API surface for a property that already flows through `PUT`; the existing route is sufficient with validation added. |
| Emit only `config:service.updated` and rely on payload diffing | Subscribers would have to fetch the stored row to detect a rename. A dedicated event keeps consumers thin. |

## References

- [[docs/adr/015-ui-driven-service-configuration|ADR-015 UI-driven Service Configuration]]
- Backend: `[[apps/backend/src/config/store/ConfigStore.ts]]`
- Backend lifecycle: `[[apps/backend/src/application/ServiceLifecycle.ts]]`
- Event types: `[[apps/backend/src/core/eventBus.ts]]`
- Frontend: `[[apps/frontend/src/pages/Settings/ServiceEditor.tsx]]`
