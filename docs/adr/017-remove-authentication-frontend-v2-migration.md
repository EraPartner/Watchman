---
title: Remove Authentication and Migrate Frontend to v2 API Contract
type: adr
status: accepted
date: 2026-04-19
tags: [adr, authentication, api, frontend, backend, single-user, v2, security]
description: Simplified Watchman from multi-user with JWT auth to single-user home-lab app; removed authentication layer; migrated frontend to v2 envelope contract
aliases: [ADR-017, auth removal, frontend v2 migration, single-user]
---

# ADR-017: Remove Authentication and Migrate Frontend to v2 API Contract

> [!abstract] Summary
> Watchman is repositioned as a single-user home-lab monitoring dashboard. Authentication (JWT, CSRF, login page, rate-limiting middleware) has been removed entirely. The frontend is now fully migrated to the v2 API contract with consistent response envelope ({data} or {error:{code,message}}), and backend port default changed from 3101 to 3001.

## Status

- **Status**: Accepted
- **Date**: 2026-04-19
- **Supersedes**: [[docs/security/authentication|Authentication documentation]] (now deprecated)
- **Extended by**: [[docs/adr/018-split-deploy-pi-backend|ADR-018]] (split-deploy Pi backend + Mac client; reinforces LAN-only posture)

## Context

Watchman was initially architected as a multi-user monitoring application with:
- JWT authentication with HTTP-only cookies and CSRF protection
- Login page and AuthGuard route protection
- Rate-limiting middleware for brute-force and DDoS prevention
- Multi-user credential validation via `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` environment variables

However, Watchman is deployed as a **single-user home-lab application**, typically running on a personal server or NAS with no external exposure. The auth complexity added:
- Overhead for test coverage (150+ auth-related tests)
- Frontend code burden (AuthGuard, useAuth, CSRF utilities, Login page)
- Backend middleware pipeline complexity
- Configuration requirements (JWT secrets, password hashing)

The v2 API contract introduced a standardized response envelope:
- Success: `{data: {...}}`
- Error: `{error: {code: "...", message: "..."}}`

This envelope simplified backend endpoint contracts and enabled the frontend to eliminate auth-adjacent logic.

## Decision

### Authentication Removed

1. **Backend**: Deleted auth middleware, JWT token handling, CSRF validation, login endpoints, and password verification.
2. **Frontend**: Removed:
   - `useAuth` hook and AuthGuard component
   - Login page and SetupWizard auth step
   - CSRF utility (`csrf.ts`)
   - `useFrontendConfig` hook (previously used to fetch CSRF configuration)
   - 473+ lines of auth tests

3. **Environment**: Removed `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` from backend config. Watchman now starts without admin credentials.

4. **Security Posture**: Watchman is now intended for **trusted networks only**. Network isolation or VPN is the responsibility of the operator.

### Frontend Fully Migrated to v2 Contract

1. **Response Envelope**: Frontend API client now:
   - Unwraps `{data}` responses automatically in `core.ts`
   - Handles `{error: {code, message}}` error responses with proper error codes
   - Throws typed `DomainError` exceptions with `code` and `message` fields

2. **Endpoint Routes**: Frontend consumes v2 surface:
   - `/services` (aggregated health)
   - `/services/{kind}/health`, `/services/{kind}/stats`, `/services/{kind}/history`
   - `/instances`, `/instances/{kind}`, `/kinds`
   - `/config/services`, `/setup/status`, `/meta/health`, `/metrics`

3. **Types Simplified**: Frontend types (`ApiClient`, endpoints) reduced from 342 lines to under 240 lines by eliminating auth-adjacent types and aligning with v2 schemas.

### Port Default Change

- **BACKEND_V2_PORT**: Changed default from `3101` → `3001`
- **Rationale**: Matches OpenAPI spec baseline and Electron/desktop app expectations
- **Environment Variable**: Renamed from `BACKEND_V2_PORT` in code to align with final port exposure

## Consequences

### Positive

- **Simplified Codebase**: Removed ~800+ lines of auth-related frontend + backend code
- **Faster Startup**: No JWT secret validation, password hashing, or CSRF header checks
- **Clearer Intent**: Watchman is explicitly single-user; deployment assumptions are transparent
- **Easier Deployment**: No need to generate `AUTH_PASSWORD_HASH` or manage JWT secrets for simple home-lab setups
- **Test Suite Reduction**: ~150 auth tests removed; focus on service integration tests instead
- **Type Safety**: v2 envelope contract is strictly typed across frontend and backend
- **Mobile-Friendly**: No CSRF double-submit cookies required; simpler WebSocket auth

### Negative

- **No Multi-User Support**: If future versions need multi-user, auth must be re-architected from scratch
- **Network Security Only**: Watchman now depends entirely on network isolation (firewall, VPN, closed network)
- **Breaking Change**: Existing deployments with `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` env vars will need removal
- **No Per-User Audit Trail**: Configuration changes are not attributed to specific users (trade-off of single-user design)

### Risks

- **Accidental Exposure**: If exposed to untrusted networks, Watchman has no authentication barrier. Operators must enforce network isolation.
- **Credential Migration**: Existing Watchman instances must manually remove auth env vars and reconfigure frontend after upgrade
- **Backward Compatibility**: Legacy endpoints and auth-dependent clients will fail. This is a hard breaking change.

## Alternatives Considered

| Alternative | Why Rejected |
| --- | --- |
| **Optional Auth** (feature flag) | Adds complexity; v2 contract design assumes no auth. Mixed auth/no-auth increases test burden and deployment confusion. |
| **Reverse-Proxy Auth** (delegate to nginx/traefik) | Possible but shifts burden to operator; defeats built-in rate-limiting and IP control. |
| **Keep v1 Auth, Support Both Endpoints** | Violates single-user assumption; duplicates API surface and tests. v2 is the canonical design. |
| **API Key Instead of JWT** | Still adds auth overhead; doesn't align with single-user, single-operator intent. |

## References

- [[docs/adr/index|ADR Index]]
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] — Backend rewrite (TypeScript + Fastify 4)
- [[docs/api/index|API Documentation]] — v2 endpoint contracts and response envelopes
- [[apps/backend/openapi.yaml|OpenAPI Spec]] — Machine-readable v2 contract
- [[apps/frontend/src/services/apiClient/endpoints.ts|Frontend API Client]] — Migrated endpoints
- [[apps/backend/.env.example|Backend Env Template]] — Removed auth variables
- **Commit**: `6abf46b` — feat: migrate frontend to backend v2 contract + remove auth
