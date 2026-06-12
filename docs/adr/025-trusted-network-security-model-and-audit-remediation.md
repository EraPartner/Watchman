---
title: "ADR-025: Trusted-Network Security Model and Audit Remediation Decisions"
type: adr
status: accepted
date: 2026-06-12
tags: [adr, architecture, security, websocket, circuit-breaker, caching]
description: Confirms the no-auth trusted-network model for backend v2 and records the decisions taken while remediating the 2026-06-12 audit (TODO.md C1–C15, A1–A5, P1–P6, SEC/ACC/UX/D items)
aliases: [adr-025, trusted network security model]
---

# ADR-025: Trusted-Network Security Model and Audit Remediation Decisions

> [!abstract] Summary
> Backend v2 stays unauthenticated by design (reaffirming [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]]); browser access is gated by a shared origin allow-list, the docs are corrected to match the code, and the audit's "wire it or delete it" forks are resolved as recorded here.

## Status

- **Status**: Accepted
- **Date**: 2026-06-12

## Context

The 2026-06-12 audit (`TODO.md`) found systemic doc/implementation drift: CLAUDE.md and parts
of `openapi.yaml` described a JWT/CSRF/rate-limited Express backend that does not exist (the
backend is Fastify 5 with no auth), the WebSocket gate required an `Authorization` header
browsers cannot send (so the real-time layer never connected), and several fully-built infra
modules (circuit breaker, SWR cache, ZMQ subscriber, GPIO controller) were tested but never
wired. Each of these was a fork: implement the documented behavior, or align docs/wiring with
the working design.

## Decision

1. **Security model: trusted-network, single-user, no auth** — reaffirming ADR-017. CLAUDE.md's
   Security/Environment sections and the OpenAPI info block now state this explicitly. The
   `X-CSRF-Token` CORS advert was removed (nothing validates it; the frontend never sends it).
2. **Browser gating via a shared origin allow-list** (`transport/originPolicy.ts`): desktop
   `watchman://` and loopback dev origins are always allowed; extra origins come from the new
   `CORS_ALLOWED_ORIGINS` env var. The same predicate gates HTTP CORS (with explicit preflight
   handling: 204 allowed / 403 denied) and the WebSocket upgrade. Requests without an Origin
   header (non-browser clients) are allowed — the gate exists to stop cross-site browser
   requests, not to authenticate peers.
3. **WebSocket tokens are optional** — the gate accepts tokenless connections (browsers cannot
   set handshake headers); `?token=`/`Authorization: Bearer` are still extracted for future use.
4. **`TRUST_PROXY` defaults to false** — `X-Forwarded-*` is only honored when explicitly enabled.
5. **`BACKEND_V2_HOST` keeps its `0.0.0.0` default** — changing it would break existing LAN/web
   deployments; the trusted-network expectation is documented instead. _Open question logged:
   whether a loopback default + explicit opt-in would be safer for new installs._
6. **Wire, not delete**: circuit breakers (per-instance health/stats pair, registered in
   `/metrics`), SWR stats cache honoring `cacheTtlMs`, latest-health snapshot serving for
   `GET /services` (no more live fan-out per read), Bitcoin ZMQ block streaming, and GPIO
   control (`gpio:write:<pin>:<0|1>`, `gpio:mode:<pin>:<input|output>` via the existing
   `/services/raspberryPi/control` route). Deleted as dead: backend `infra/ws/wsClient`,
   `core/container`, and the legacy frontend ping-card chain (`usePingServiceCard`,
   `useEnabledServices`, `dashboardStatus`, `ServiceLink`, `lib/url`).
7. **Canonical service kinds are the backend camelCase strings** (`albyHub`, `macMini`,
   `philipsBridge`, `raspberryPi`); the frontend renderer layer was fixed to match and the dead
   kinds `beryl`/`telenet`/`nostrcheck` were removed.
8. **OpenAPI types are generated and committed** (`npm run generate:types` →
   `src/types/generated.ts`); the API client still hand-maintains `apiClient/types.ts`.
   _Follow-up logged: migrate the client onto the generated types and add a CI check._
9. **Setup gate stays dashboard-only** (UX2): `/settings/*` remains reachable on an
   unconfigured instance as an alternative to the wizard — intended for a single-user tool.

## Consequences

### Positive

- Docs, spec, and code agree; the real-time layer actually works in browsers; resiliency and
  caching advertised by the docs now run in production.
- A LAN/web deployment is possible by setting `CORS_ALLOWED_ORIGINS`.

### Negative

- No defense if the network is not actually trusted — anyone who can reach the port can
  reconfigure services. This is accepted and documented, not mitigated.

### Risks

- Origin gating is not authentication; a future multi-user or untrusted-network deployment
  requires a real auth layer (would supersede this ADR).

## Alternatives Considered

| Alternative                                                 | Why Rejected                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Implement JWT + CSRF + rate limiting as CLAUDE.md described | Large scope, no login UI exists, contradicts ADR-017's deliberate removal; single-user trusted-network model fits the deployment reality |
| Delete unwired breaker/SWR/ZMQ/GPIO modules                 | The modules were complete and tested; wiring them delivers the documented behavior (and `cacheTtlMs` already had UI/storage)             |
| Frontend lowercase kinds as canonical                       | Setup flow and backend already used camelCase; only the renderer layer had invented the variants                                         |

## References

- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017: Remove Authentication]]
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013: Backend Rewrite (TypeScript + Fastify)]]
- Audit findings: `TODO.md` (2026-06-12)
- Related code: `apps/backend/src/transport/originPolicy.ts`,
  `apps/backend/src/application/SnapshotCache.ts`,
  `apps/backend/src/infra/circuitBreaker/guardedService.ts`
