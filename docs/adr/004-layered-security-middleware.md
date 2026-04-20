---
title: ADR-004 - Layered Security Middleware Stack (Superseded)
type: adr
status: superseded
date: 2026-04-02
superseded_by: docs/adr/017-remove-authentication-frontend-v2-migration
superseded_date: 2026-04-19
tags: [adr, security, backend, middleware, superseded, historical]
description: Historical defense-in-depth middleware stack — superseded by ADR-017 (auth removed) and ADR-013 (Fastify rewrite)
aliases: [security middleware, defense in depth, layered security]
---

# ADR-004: Layered Security Middleware Stack (Superseded)

> [!danger] Superseded by ADR-017 and ADR-013
> This ADR described a 10-layer defense-in-depth middleware stack (Helmet, CORS, JWT, CSRF, tiered rate limiting, IP control, account lockout, timeout, size limits, input validation) on the Express backend. It is **no longer implemented**. As of v2.3:
> - Auth, CSRF, rate-limit, IP-control, and account-lockout middleware were **removed** — see [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]].
> - Express was **replaced by Fastify 4** — see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]].
>
> Current security posture: single-user home-lab app; network isolation is the operator's responsibility. Remaining transport-layer middleware: `logSamplingPlugin`, `requestTimeoutPlugin`, `compress`, `errorHandlerPlugin` (plus `@fastify/helmet` and CORS handled inline for the `watchman://` origin).

> [!abstract] Historical Summary
> The backend previously applied security in multiple layers: Helmet, CORS, JWT authentication, CSRF protection, tiered rate limiting, IP access control, account lockout, request timeout, response size limits, and input validation.

## Status

- **Status**: Superseded
- **Superseded by**: [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] (auth removed), [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] (Express → Fastify)
- **Date**: 2026-04-02
- **Superseded date**: 2026-04-19

## Context

As a monitoring dashboard exposing service health and control endpoints, Watchman needs robust security. The backend is accessible over the network and must protect against common web vulnerabilities while maintaining usability.

## Decision

Security is implemented as a defense-in-depth middleware stack applied in `server.js`:

1. **Helmet** - CSP, HSTS, X-Frame-Options, and other HTTP security headers
2. **CORS** - Strict origin validation against `FRONTEND_URL`
3. **JWT Authentication** - HTTP-only cookies prevent XSS token theft
4. **CSRF Protection** - Double-submit cookie pattern (no server-side session storage needed)
5. **Tiered Rate Limiting** - Different limits per endpoint category:
   - `authLimiter` - Strictest for login endpoints
   - `healthLimiter` - Moderate for health checks
   - `generalLimiter` - Standard for most endpoints
   - `controlLimiter` - Strict for service control actions
6. **IP Access Control** - Allow/deny lists for specific IPs
7. **Account Lockout** - Prevents brute force attacks
8. **Request Timeout** - Prevents slow-loris and resource exhaustion
9. **Response Size Limits** - Prevents memory exhaustion
10. **Input Validation** - Server-side validation on all inputs

### Key Code

- `[[apps/backend/middleware/auth.js]]` - JWT authentication
- `[[apps/backend/middleware/csrf.js]]` - CSRF protection
- `[[apps/backend/middleware/rateLimiting.js]]` - Tiered rate limiting
- `[[apps/backend/middleware/ipControl.js]]` - IP access control
- `[[apps/backend/middleware/accountLockout.js]]` - Brute force protection
- `[[apps/backend/middleware/validation.js]]` - Input validation

## Consequences

### Positive

- Defense-in-depth: if one layer fails, others provide protection
- JWT in HTTP-only cookies prevents XSS token theft
- Double-submit CSRF works without server-side session storage
- Tiered rate limiting applies appropriate limits per endpoint sensitivity
- Production-specific enforcement (HTTPS required, JWT secret minimum length)

### Negative

- Single-user auth model -- no user management, roles, or database
- bcrypt compare is always performed even for wrong usernames (intentional timing attack prevention, but adds latency)
- CSRF token is accessible to JavaScript (`httpOnly: false`) which slightly reduces XSS protection

### Risks

- JWT tokens are short-lived (15m) but login cookie is 8 hours -- potential mismatch
- No multi-user support limits deployment scenarios

## PlantUML Diagrams

### Security Middleware Stack

```plantuml
@startuml
!theme plain

skinparam roundcorner 10

package "Incoming Request" {
    [HTTP Request] as Req
}

package "Layer 1: Transport" {
    [Helmet] as H1
    [CORS] as C1
}

package "Layer 2: Access Control" {
    [IP Control] as IP
    [Rate Limiter] as Rate
}

package "Layer 3: Authentication" {
    [JWT Auth] as JWT
    [CSRF] as CSRF
    [Account Lockout] as Lockout
}

package "Layer 4: Request Validation" {
    [Request Timeout] as Timeout
    [Response Size Limit] as SizeLimit
    [Input Validation] as Valid
}

package "Layer 5: Response" {
    [API Response] as API
    [Compression] as Comp
}

Req --> H1
H1 --> C1
C1 --> IP
IP --> Rate
Rate --> JWT
JWT --> CSRF
CSRF --> Lockout
Lockout --> Timeout
Timeout --> SizeLimit
SizeLimit --> Valid
Valid --> API
API --> Comp

note right of H1
  Security Headers:
  - CSP
  - HSTS
  - X-Frame-Options
  - X-Content-Type-Options
end note

note right of Rate
  Tiered Limits:
  - authLimiter: 5/min
  - healthLimiter: 30/min
  - generalLimiter: 100/min
  - controlLimiter: 10/min
end note
@enduml
```

### Request Processing Pipeline

```plantuml
@startuml
!theme plain

actor "Attacker" as Attacker
actor "Legitimate User" as User
participant "Backend" as BE

alt Brute Force Attack
    Attacker -> BE : POST /api/auth/login\n(many attempts)
    BE -> BE : Check rate limit
    BE -> BE : Increment failed attempts

    alt Lockout Triggered
        BE --> Attacker : 429 Too Many Requests\nAccount locked
    else Below Threshold
        BE -> BE : bcrypt compare
        BE --> Attacker : 401 Unauthorized
    end

else Normal Login
    User -> BE : POST /api/auth/login
    BE -> BE : Check rate limit
    BE -> BE : Validate credentials
    BE -> BE : Generate JWT
    BE -> BE : Set HTTP-only cookie
    BE --> User : 200 OK
end
@enduml
```

### CSRF Double-Submit Pattern

```plantuml
@startuml
!theme plain

participant "Browser" as Browser
participant "Frontend JS" as FE
participant "Backend" as BE

Browser -> BE : GET /api/data
BE --> Browser : Response + Set-Cookie:\ncsrf-token=<secret>

Browser -> Browser : Store csrf-token in cookie\n(malicious script cannot read)

note over Browser
  User performs action
end note

Browser -> FE : Button click
FE -> FE : Read csrf-token cookie
FE -> BE : POST /api/action\nX-CSRF-Token: <token>\nCookie: csrf-token=<token>

BE -> BE : Compare tokens

alt Tokens Match
    BE -> BE : Execute action
    BE --> FE : 200 OK
else Tokens Mismatch
    BE --> FE : 403 Forbidden
end
@enduml
```

## Alternatives Considered

| Alternative        | Why Rejected                                     |
| ------------------ | ------------------------------------------------ |
| Session-based auth | Requires server-side storage, doesn't scale well |
| API key auth       | Less secure for browser-based applications       |
| OAuth/OIDC         | Overkill for single-user self-hosted deployment  |
| No CSRF protection | Vulnerable to cross-site request forgery         |

## References

- [[docs/security/index|Security Overview]]
- [[docs/security/authentication|Authentication]]
- [[docs/security/rate-limiting|Rate Limiting]]
- [[docs/security/ip-control|IP Control]]
- Related code: `[[apps/backend/middleware/auth.js]]`
- Related code: `[[apps/backend/middleware/csrf.js]]`
- Related code: `[[apps/backend/middleware/rateLimiting.js]]`
