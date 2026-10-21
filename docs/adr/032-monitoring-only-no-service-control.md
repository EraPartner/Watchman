---
title: Monitoring Only, No Service Control
type: adr
status: accepted
date: 2026-10-21
tags: [adr, architecture, security, services, api]
description: Watchman is read-only toward monitored services; the control route and GPIO writes are removed
aliases: [adr-032, monitoring only, read-only services, no service control]
---

# ADR-032: Monitoring Only, No Service Control

> [!abstract] Summary
> Watchman reads monitored services and never changes them. The generic control route and every
> code path that could change a monitored service are removed.

## Status

- **Status**: Accepted
- **Date**: 2026-10-21

## Context

The project's planning notes make monitoring-only a hard constraint, and the owner confirmed on
2026-10-21 that Watchman must be strictly read-only toward the services it monitors. The code still
shipped `POST /services/:kind/control`, which dispatched any `action` string to a service's
`control()` method. `RaspberryPiService` used it for `gpio:write` and `gpio:mode` through pigpiod. No
UI called it.

[[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025]] records wiring the
GPIO controller into that route. This ADR reverses that part.

## Decision

- Remove `POST /services/:kind/control`, `ControlService`, the `Controllable` interface,
  `isControllable()` and the circuit-breaker pass-through.
- Remove `RaspberryPiService.control()` and GPIO `write` / `setMode` from `GpioController` and the
  pigpio client, shared client and implementation. Reads stay.
- Remove the frontend `controlService()` client and its types, the OpenAPI path and generated types.
- Add regression tests: the route is gone (404), no write method is accepted under `/services`, the
  breaker wrapper forwards no `control()`, and the pigpio handle exposes no write or mode change.

Kept, because reads need them: Hue pairing creates an application key on the bridge (user-initiated
in setup), service logins create sessions (qBittorrent, Homebridge, Synology DSM), Roon registers an
extension and subscribes to zones, and Tor `AUTHENTICATE` / `SETEVENTS` are connection-scoped.

Also kept, at the owner's request (2026-10-21) because other services need them: the Tor control
client's `signal()` method and `infra/tor/torManager.ts`. Neither is reachable from an HTTP route.

## Consequences

### Positive

- No HTTP path can change a monitored service, and the tests fail if one is added under `/services`.
- Smaller attack surface on a no-auth, trusted-network API.

### Negative

- GPIO control on the Raspberry Pi is no longer available from Watchman.

### Risks

- The HTTP, SSH and DSM clients are generic and could still carry a write if a future service sends
  one. Reviews should treat any such call as a defect.

## References

- [[docs/adr/index|Architecture Decision Records]]
- [[docs/integrations/raspberry-pi|Raspberry Pi Integration]]
- [[docs/api/index|API Documentation]]
