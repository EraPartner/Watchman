---
title: "ADR-027: Service Profiles and Network Auto-Switch"
type: adr
status: accepted
date: 2026-06-13
tags: [adr, architecture, profiles, multi-instance, networking, lifecycle]
description: Named per-location profiles owning disjoint service sets, with a server-authoritative active profile and gateway-MAC LAN auto-switching.
aliases: [profiles, service profiles, network auto-switch, adr-027]
---

# ADR-027: Service Profiles and Network Auto-Switch

> [!abstract] Summary
> Introduce named **profiles**, each owning a disjoint set of service instances; exactly one is active at a time and only its services are monitored. The active profile is chosen automatically from the LAN's default-gateway MAC, with a manual override.

## Status

- **Status**: Accepted
- **Date**: 2026-06-13

## Context

Watchman stored service config as one flat set of instances ([[docs/adr/015-ui-driven-service-configuration|ADR-015]]). A single user moving a laptop/host between LANs (home, office, …) had no way to keep separate, preconfigured sets per location. Services belonging to the "other" network sat in the dashboard showing offline and generated circuit-breaker churn and wasted probes against unreachable hosts.

Constraints carried from the existing model:

- Single-user, trusted-network posture — no per-user/per-client state ([[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025]]).
- Service config lives in DuckDB; migrations are idempotent `CREATE TABLE IF NOT EXISTS` run on boot.
- Hot-reload of services already flows through the EventBus → `ServiceLifecycle` → poller path; the `enabled` flag is the single gate deciding whether a service is brought up.

## Decision

**Data model.** A new `app_profile` table (id, name, description, color, `network_sigs` JSON) and a generic `app_setting` key/value table (active profile id, auto-switch flag, last detected signature). Each `app_service_instance` gains a nullable `profile_id` column (added with `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). Membership is **one profile per service** (disjoint sets).

**Server-authoritative monitoring gate.** `ServiceLifecycle.bringUp()` widens its gate from `enabled` to `enabled && profileId === activeProfileId`. Out-of-profile services are never instantiated, polled, or probed. A new `switchActiveProfile(id, reason)` persists the active id and reconciles the running set (reusing the pause→reload path), then emits `profile.switched`.

**Strict single-active model.** Exactly one profile is always active and every service belongs to one (no global "all" view). `ProfileStore.ensureBootstrap()` runs on boot: it creates a **Default** profile when none exist, ensures a valid active profile, and backfills any unassigned service rows into the active profile — so fresh and pre-existing installs both hold the invariant. Deleting a profile is rejected (409) when it is active, non-empty, or the last remaining one.

**LAN auto-switch.** A `NetworkWatcher` ticks on boot and on an interval. `gatewayDetect` parses the default gateway (`ip route` on Linux, `route -n get default` on macOS/BSD) and ARP-resolves it to the **gateway MAC** (reusing the existing `arpLookup` tooling) — the primary LAN fingerprint. On a _change_ of signature it matches the gateway MAC against each profile's captured `network_sigs`: if a different profile matches and auto-switch is on, it calls `switchActiveProfile(…, "auto")`; if nothing matches it emits `profile.network.unrecognized` and stays put. Acting only on signature _change_ (tracked via `last_detected_signature`) makes a manual override stick until the LAN actually changes.

## Consequences

### Positive

- Moving between LANs cleanly swaps the monitored set; no offline-spam or breaker churn from unreachable hosts on the wrong network.
- Auto-switch is hands-off yet predictable, with a manual override and an "assign this network" capture flow for unrecognized LANs.
- Reuses existing seams (lifecycle gate, EventBus/WebSocket broadcast, ARP tooling, idempotent migrations); the `app_setting` table is reusable for future settings.

### Negative

- Adds a persistence column and two tables; a guarded one-time migration/backfill on upgrade.
- The active profile is global (single-user); two browsers see the same active profile by design.

### Risks

- Gateway/MAC detection depends on `ip`/`route`/`arp` being available (e.g. in the Electron-bundled backend); detection degrades gracefully to no-op when unavailable.
- Bootstrap must always leave one profile active or the dashboard would show nothing; covered by `ensureBootstrap` and the delete invariants.

## Alternatives Considered

| Alternative                                             | Why Rejected                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Hide out-of-profile services client-side only           | Still polls/probes unreachable hosts; no network or breaker savings.                                |
| Many-to-many membership (a service in several profiles) | More flexible but heavier UI/model; the per-location use case is disjoint sets.                     |
| Separate `DATA_DIR` per LAN (existing workaround)       | Launch-time only, no in-app switch, duplicates the whole store.                                     |
| SSID-based detection                                    | Wi-Fi-only; backend often runs wired. Gateway MAC works for both.                                   |
| Gateway IP + subnet fingerprint                         | Collides across networks that share private ranges (e.g. 192.168.1.0/24); MAC is unique per router. |

## References

- [[docs/features/profiles|Profiles feature]]
- [[docs/adr/015-ui-driven-service-configuration|ADR-015: UI-driven service configuration]]
- [[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025: Trusted-network security model]]
- Related code: `[[apps/backend/src/config/store/ProfileStore.ts]]`, `[[apps/backend/src/application/NetworkWatcher.ts]]`, `[[apps/backend/src/infra/net/gatewayDetect.ts]]`, `[[apps/backend/src/application/ServiceLifecycle.ts]]`, `[[apps/backend/src/transport/http/routes/profiles.ts]]`
