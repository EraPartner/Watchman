---
title: Auth Middleware (Superseded)
type: security
status: superseded
date: 2026-04-11
superseded_by: docs/adr/017-remove-authentication-frontend-v2-migration
superseded_date: 2026-04-19
tags: [security, middleware, authentication, jwt, backend, superseded, historical]
description: Historical JWT auth middleware — removed in v2.3 per ADR-017; retained for archival context only
aliases: [auth middleware, jwt middleware, authentication, requireAuth]
---

# Auth Middleware (Superseded)

> [!danger] Superseded — No Longer Implemented
> This document describes the **historical** `auth.js` middleware that handled JWT generation, verification, and credential checks. As of v2.3, the entire auth layer has been removed. See [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]]. The files, environment variables (`JWT_SECRET`, `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`), and middleware described below no longer exist. Content retained for archival reference only.

> [!abstract] Historical Overview
> The auth middleware previously handled JWT token generation, verification, and credential authentication. It provided the core authentication layer for the Watchman API.

## Files

- `apps/backend/middleware/auth.js` - Main authentication middleware

## Core Functions

### Token Management

| Function                   | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `signToken(payload, opts)` | Generate a signed JWT with configurable expiration |
| `verifyToken(token)`       | Verify and decode a JWT, returns null on failure   |

### Credential Authentication

| Function                                      | Description                                           |
| --------------------------------------------- | ----------------------------------------------------- |
| `authenticateCredentials(username, password)` | Validate username/password against environment config |

## Token Configuration

```javascript
// Token signing options
jwt.sign(payload, JWT_SECRET, {
  expiresIn: "15m", // 15 minute expiration
  algorithm: "HS256", // Explicit algorithm
});
```

| Setting    | Value                     |
| ---------- | ------------------------- |
| Algorithm  | HS256                     |
| Expiration | 15 minutes                |
| Secret     | `JWT_SECRET` env variable |

## Middleware: requireAuth

The `requireAuth` middleware protects API endpoints:

```javascript
import { requireAuth } from "./middleware/auth.js";

app.get("/api/protected", requireAuth, (req, res) => {
  // req.user contains decoded token payload
  res.json({ user: req.user });
});
```

### Flow

```
Request → requireAuth middleware
  ↓
Extract token from:
  1. Authorization: Bearer <token>
  2. Cookie: token=<token>
  ↓
Verify token with JWT_SECRET
  ↓
Attach user to req.user
  ↓
Next middleware
```

### Response on Failure

```json
// Missing token
{
  "error": "Unauthorized",
  "message": "Authentication token required"
}

// Invalid/expired token
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

## Credential Authentication

```javascript
const user = await authenticateCredentials(username, password);
if (user) {
  // Valid credentials
}
```

### Security Features

- **Timing attack prevention**: Always performs bcrypt compare (even on invalid username)
- **Input validation**: Rejects non-string input, limits length (128/256 chars)
- **Single user**: Uses `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` from environment

## Environment Variables

| Variable             | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `JWT_SECRET`         | Secret key for signing JWTs (min 32 chars recommended) |
| `AUTH_USERNAME`      | Admin username                                         |
| `AUTH_PASSWORD_HASH` | bcrypt hash of admin password                          |

## Coverage Notes

- `requireAuth` and credential error-path behavior are covered in `apps/backend/tests/authMiddleware.test.js`, including the bcrypt failure branch.
- `requireAuth` decoded-token handling now explicitly covers payloads without `iat` in `apps/backend/tests/authMiddleware.test.js` (`req.user.tokenIssuedAt` stays `undefined`).
- Token extraction/verification edge cases are covered in `apps/backend/tests/authToken.test.js`, including non-object request handling and empty-key cookie parsing behavior.
- CSRF validation edge cases for state-changing requests are covered in `apps/backend/tests/csrf.test.js`, including mismatched-length token rejection and production cookie options (`secure=true`, `sameSite='strict'`).

## PlantUML Diagrams

### JWT Token Flow

```plantuml
@startuml
!theme plain

actor "User" as User
participant "Frontend" as FE
participant "Backend" as BE
participant "Auth Middleware" as Auth
database "Environment" as Env

User -> FE : Enter credentials
FE -> BE : POST /api/auth/login\n(username, password)

BE -> Auth : authenticateCredentials()
Auth -> Env : Get AUTH_USERNAME\nAUTH_PASSWORD_HASH

alt Valid Credentials
    Auth -> Auth : Generate JWT payload\n{username, iat, exp}
    Auth -> Auth : signToken(payload, JWT_SECRET)
    Auth --> BE : JWT token
    BE -> BE : Set HTTP-only cookie\n(httpOnly, secure, sameSite)
    BE --> FE : 200 OK + CSRF token
else Invalid Credentials
    Auth --> BE : null
    BE -> BE : Increment failed attempts
    alt Lockout Threshold Reached
        BE -> BE : Lock account temporarily
    end
    BE --> FE : 401 Unauthorized
end
@enduml
```

### requireAuth Middleware Flow

```plantuml
@startuml
!theme plain

participant "Request" as Req
participant "requireAuth" as Auth
participant "JWT Library" as JWT
database "JWT_SECRET" as Secret

Req -> Auth : Intercept request
Auth -> Auth : Extract token

alt No Token Provided
    Auth --> Req : 401 Unauthorized\n"Authentication token required"
else Token in Header
    Auth -> JWT : verifyToken(token, JWT_SECRET)
else Token in Cookie
    Auth -> Auth : Read token cookie
    Auth -> JWT : verifyToken(token, JWT_SECRET)
end

alt Token Valid
    JWT --> Auth : Decoded payload
    Auth -> Req : Attach req.user = payload
    Auth -> Req : Next middleware
else Token Invalid/Expired
    JWT --> Auth : Error
    Auth --> Req : 401 Unauthorized\n"Invalid or expired token"
end
@enduml
```

### CSRF Protection Flow

```plantuml
@startuml
!theme plain

actor "User" as User
participant "Frontend" as FE
participant "Backend" as BE
participant "CSRF Middleware" as CSRF

note over User
  GET requests: No CSRF needed
end note

User -> FE : GET /api/services
FE -> BE : GET /api/services
BE --> FE : 200 OK + csrf-token cookie

note over User
  POST/PUT/DELETE: CSRF required
end note

User -> FE : Perform action (delete)
FE -> BE : DELETE /api/service\nX-CSRF-Token: <token>\nCookie: csrf-token=<token>

BE -> CSRF : Validate CSRF
CSRF -> CSRF : Compare header token\nwith cookie token

alt Tokens Match
    CSRF -> BE : Proceed to handler
    BE --> FE : 200 OK
else Tokens Don't Match
    CSRF --> FE : 403 Forbidden\n"CSRF token mismatch"
end
@enduml
```

## Related

- [[docs/security/authentication|Authentication Overview]]
- CSRF Middleware
- `apps/backend/server.js`
