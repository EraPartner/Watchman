---
title: "Session: Audit Remediation — All TODO.md Findings Implemented"
type: review
status: complete
date: 2026-06-12
tags:
  [
    session,
    review,
    audit,
    remediation,
    websocket,
    circuit-breaker,
    caching,
    security,
  ]
description: Session note for the 2026-06-12 pass that implemented all 42 findings from the same-day audit (TODO.md) — real-time pipeline repaired, kind vocabulary unified, dead infra wired or deleted, docs aligned with code
aliases: [audit remediation session, 2026-06-12 session]
---

# Session: Audit Remediation (2026-06-12)

> [!abstract] Summary
> Implemented every finding from the 2026-06-12 audit (`TODO.md`, 42 items: C1–C15, P1–P6, A1–A5, SEC1–2, ACC1, UX1–3, D1–D6, DOC1, OBS1, CORS1). Decision log: [[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025]]. All gates green: backend 526 tests / frontend 433 tests, typecheck (backend + frontend + desktop), lint (0 errors), full build.

## Headline fixes

1. **Real-time layer repaired end-to-end** — the WebSocket could never connect from a browser (Bearer-header-only gate); now origin-gated with optional token, shared origin policy with CORS (`transport/originPolicy.ts`, `CORS_ALLOWED_ORIGINS`). Client invalidates React Query caches from `service_update` frames keyed by `kind`; reconnects counted once per failure; service errors broadcast as transition-deduped alerts (first failure + recovery) so the Events tab and toasts work.
2. **Kind vocabulary unified** — frontend renderer layer adopted the backend's camelCase kinds (`albyHub`, `macMini`, `philipsBridge`, `raspberryPi`), un-breaking 4 of 13 service tiles; dead kinds `beryl`/`telenet`/`nostrcheck` removed; `RENDERERS` is now an exhaustive typed record.
3. **Dead infra wired** — per-instance circuit breakers (health/stats pairs) + SWR stats caches honoring `cacheTtlMs` + latest-snapshot serving for `/services` ([[docs/performance/caching-strategies|caching strategies]]); Bitcoin ZMQ block streaming; Raspberry Pi GPIO control via `/services/raspberryPi/control`. Deleted as dead: backend `wsClient`, `core/container`, frontend legacy ping-card chain.
4. **Docs follow code** — no-auth trusted-network model documented (ADR-017 reaffirmed by ADR-025); CLAUDE.md Environment/Security/API sections rewritten; `openapi.yaml` corrected (Fastify 5, WS contract, broken `$ref` fixed) and `generated.ts` now generates and is committed.

## Other notable changes

- Hue cert pinning enforced in the TLS handshake of the request connection (TOCTOU eliminated); DSM credentials/\_sid moved to POST bodies; pino redaction configured.
- Startup: listen before service bring-up; concurrent bring-up with 10s `onStart` timeout.
- Request-scoped `AbortController` cancels in-flight service work on HTTP timeout/disconnect.
- ConfigStore partial updates preserve `pollPolicy`/`cacheTtlMs`/`timeoutMs`; DuckDbPool is a real bounded pool.
- SNMP 64-bit HC counters + per-poll byte rates (router, Synology); qBittorrent active torrents from maindata sync; Tor enrichment cached 1h; AlbyHub endpoint caching + NWC default; shared persistent pigpiod connection.
- `/metrics` now reports breakers, caches, and a new `errors: { total, byService }` counter.

## Follow-ups (logged, not done)

- Migrate the frontend API client from hand-maintained `apiClient/types.ts` onto the generated OpenAPI types; add a CI check that the spec matches routes.
- Open question for review: should `BACKEND_V2_HOST` default to loopback for new installs? (kept `0.0.0.0` to avoid breaking existing deployments)

## Verification

- Backend: 55 test files / 526 tests ✅ · tsc ✅ · eslint 0 errors ✅ · build ✅
- Frontend: 40 test files / 433 tests ✅ · tsc ✅ · eslint 0 errors ✅ · build ✅
- Desktop: tsc ✅

## Related

- [[docs/adr/025-trusted-network-security-model-and-audit-remediation|ADR-025]]
- [[docs/features/real-time-updates|Real-Time Updates]]
- [[docs/security/index|Security]]
- `TODO.md` (all items checked off with remediation notes)
