---
title: Reachability Derivation Invariant + Telemetry Scope Confirmation
type: adr
status: accepted
date: 2026-06-13
tags:
  [adr, monitoring, health, two-tier, reachability, telemetry, prometheus, ping]
description: Standardize the derived `reachable` boolean so a service is never marked offline while its defining signal is healthy (service-tier wins for daemon-primary services), and confirm the telemetry scope — no durable history store and no Prometheus, reaffirming ADR-019.
aliases: [ADR-026, reachability invariant, service-tier wins, telemetry scope]
---

# ADR-026: Reachability Derivation Invariant + Telemetry Scope Confirmation

> [!abstract] Summary
> Fix the cross-service inconsistency in how the top-level `HealthSnapshot.reachable` boolean is derived from the two health tiers: a service must never report `reachable: false` while its own defining signal is healthy. Concretely, the shared `withHostPing` helper stops AND-ing the host (ICMP) tier with the service tier and instead returns the service tier's result. Also formally records the decision — after a full telemetry audit — to keep history non-persistent (no server-side store, no Prometheus), reaffirming [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]].

## Status

- **Status**: Accepted
- **Date**: 2026-06-13
- **Builds on**: [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 (two-tier health)]] (tier model this clarifies), [[docs/adr/020-service-monitoring-methodology|ADR-020]] (per-service probe methodology)
- **Reaffirms**: [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019 (revert/remove time-series)]] (history stays non-persistent)

## Context

A full audit of the telemetry layer (2026-06-13) found the per-service probe
methodology from ADR-019/ADR-020 has largely shipped — every service runs the
richest signal its daemon exposes, push channels (Bitcoin ZMQ, Hue SSE, Tor
ControlPort events) are wired, and the two-tier host/service model is rendered
as dual status dots in `ServiceTile` and `ServiceDetailSheet`. The methodology
is sound. Two issues remained.

### Problem 1 — inconsistent `reachable` derivation (a correctness bug)

`HealthSnapshot` carries two tiers (`host` = ICMP, `service` = protocol probe)
plus a single derived `reachable` boolean. That derived boolean is consumed by
the aggregate "N of M online" summary, offline-gating, and tile tone. It was
computed two different ways across the 13 services:

- **`host AND service`** — the shared `withHostPing` helper, used by the 7
  daemon-primary HTTP/RPC/SNMP services (bitcoin, ipfs, qbittorrent, adguard,
  homebridge, synology, albyHub).
- **`host OR service`** — the 5 hand-rolled services (router, roon,
  philipsBridge, raspberryPi, tor).
- **host only** — macMini (ping-only health; host-primary).

The `AND` form is wrong. A host that **blocks or filters ICMP** (Docker
containers, hardened NAS, firewalls) but whose **API answers normally** yields
`host.reachable = false && service.reachable = true → reachable = false`. The
seven daemon-primary services then flap to "offline" in the aggregate count and
tone while perfectly healthy — the dual dots show the truth, but the headline
boolean lies. The `OR` services never have this problem because `OR` is lenient.

The underlying invariant the `AND` form violates: **a service should never be
reported unreachable while its own defining signal is healthy.** For a
daemon-primary service the defining signal is the service tier; ICMP is only
diagnostic context for _why_ it might be down.

### Problem 2 — no durable history (evaluated, intentionally kept as-is)

Trends exist only as a client-side, in-memory ring buffer
(`metricHistory.ts`, 60 samples per metric) that resets on reload. The
server-side recent-activity buffer + `/recent` endpoint that
[[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]] proposed as
the chart replacement was never built. The audit surfaced three options:
a Prometheus text-format exposition endpoint (delegating history to a user's
existing Prometheus/Grafana), a server-side ring buffer, or both. After review
the operator chose to **keep the current behavior** — in-session trends only,
no persistence, no Prometheus.

## Decision

### Part A — `reachable` derivation invariant

The derived `reachable` reflects the tier that defines the service's purpose:

- **Daemon-primary services** (a protocol/API/RPC probe is the point):
  `reachable = service.reachable`. The host/ICMP tier is retained in the
  snapshot for diagnostics only.
- **Host-primary services** (the box is the point; any "service" probe is an
  auxiliary capability — macMini, raspberryPi): `reachable` tracks the host tier.
  Already satisfied (`OR` / host-only), unchanged.
- **Reachability-only services** (no daemon health API — router, roon, where
  the "service" tier is a TCP-port liveness check): `reachable = host OR
service`. Already satisfied, unchanged.

Implementation: the shared `withHostPing` helper
([[apps/backend/src/domain/health.ts|health.ts]]) — used by all 7 daemon-primary
services — changes its derivation from `host.reachable && service.reachable` to
`service.reachable`. No per-service code changes are required; the 5 `OR`
services and macMini already honor the invariant.

This change is observably safe for existing tests: every service test mocks the
ping prober as reachable, so `host` is always `true` and `host && service` ≡
`service`. A new `health.test.ts` locks the four-quadrant matrix
(host×service → reachable) so the invariant cannot silently regress.

### Part B — telemetry scope confirmation

Watchman keeps **non-persistent, in-session trends only**. No server-side
history store and **no Prometheus** — neither as scraper, embedded TSDB, nor
exposition endpoint. This reaffirms ADR-019 (history removed) and ADR-020's
rejection of a Prometheus deployment. The existing JSON `/metrics` endpoint
(backend self-telemetry: breakers, poller, cache, errors, process) is unchanged
and not converted to Prometheus exposition format. If durable history is ever
wanted, the cheapest re-entry is a Prometheus text-format exposition endpoint
over the data `/metrics` already aggregates — recorded here as the preferred
future option, explicitly deferred.

## Consequences

### Positive

- ICMP-blocked-but-healthy daemon-primary services (containers, hardened NAS)
  stop showing as offline in the aggregate count and tile tone.
- One uniform, documented invariant across all 13 services; the two-tier model
  ADR-019 introduced now has unambiguous derivation semantics.
- Single-line change in a shared helper; no per-service churn; no test flips.

### Negative

- A daemon-primary service whose host is up but whose daemon crashed still reads
  `reachable: false` — correct, but it now relies on the service tier alone, so
  a flaky protocol probe is no longer masked by a successful ping. (The host dot
  still shows green, so the cause is visible.)
- Telemetry scope unchanged means the "was it down overnight?" question remains
  unanswerable in-app; accepted by the operator.

### Risks

- A service that returns `service.reachable = false` for a _configuration_ gap
  (e.g. Synology with SNMP creds unset) reports unreachable even when pingable.
  This matches prior behavior under `AND` and is surfaced via the tier `message`;
  not a regression.

## Alternatives Considered

| Alternative                                    | Why Rejected                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Standardize on `host OR service` everywhere    | Masks daemon failure when the host still pings — a weaker signal for the daemon-primary majority.                |
| Leave per-service semantics as-is              | Keeps the false-offline bug for 7 services; aggregate count and tone stay misleading.                            |
| Add Prometheus text-format exposition endpoint | Useful and cheap, but operator chose to keep telemetry scope minimal; recorded as the preferred deferred option. |
| Build server-side ring buffer + `/recent`      | Reintroduces history surface ADR-019 removed; operator declined.                                                 |

## References

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 — Two-Tier Health]]
- [[docs/adr/020-service-monitoring-methodology|ADR-020 — Monitoring Methodology]]
- [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019 — Revert/Remove Time-Series]]
- Related code: `[[apps/backend/src/domain/health.ts]]` (withHostPing), `[[apps/backend/src/domain/BaseService.ts]]` (HealthSnapshot tiers), `[[apps/frontend/src/components/tile/ServiceTile.tsx]]` (dual-dot rendering), `[[apps/frontend/src/lib/metricHistory.ts]]` (in-session trend buffer)
