---
title: "API: Authentication Endpoints"
type: api
status: active
date: 2026-04-09
tags: [api, auth, authentication, backend, jwt, csrf]
description: Authentication API endpoints - login, logout, and auth status check
aliases: [auth endpoints, login api, logout api]
---

# Authentication Endpoints

> [!abstract] Overview
> JWT-based authentication with HTTP-only cookies and CSRF protection. Single-user model with credentials from environment variables.

## Endpoints Summary

| Method | Path               | Description       | Auth Required | Rate Limit       |
| ------ | ------------------ | ----------------- | ------------- | ---------------- |
| `POST` | `/api/auth/login`  | Authenticate user | No            | `authLimiter`    |
| `POST` | `/api/auth/logout` | End session       | Yes           | `generalLimiter` |
| `GET`  | `/api/auth/me`     | Check auth status | No            | `generalLimiter` |

---

## POST /api/auth/login

> [!warning] Account Lockout
> Failed login attempts trigger account lockout after repeated failures. See [[docs/security/authentication|Authentication]] for lockout details.

### Request

```json
{
  "username": "admin",
  "password": "yourpassword"
}
```

| Field      | Type     | Required | Description         |
| ---------- | -------- | -------- | ------------------- |
| `username` | `string` | Yes      | Admin username      |
| `password` | `string` | Yes      | Plain text password |

### Response

#### 200 OK

```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "username": "admin",
    "id": "admin"
  }
}
```

Cookies set on success:

- `token` (HTTP-only, secure, SameSite=strict) - JWT access token, 8 hour expiry
- CSRF token cookie (accessible to JS) - Double-submit CSRF pattern

#### 401 Unauthorized

```json
{
  "message": "Invalid credentials"
}
```

### Security Details

- **Timing Attack Prevention**: bcrypt compare is always performed even for wrong usernames (uses dummy hash)
- **Account Lockout**: See [[docs/security/authentication|Account Lockout]]
- **Rate Limiting**: `authLimiter` - stricter than general endpoints
- **CSRF Token**: Issued on login for subsequent state-changing requests

### Source

- Route module: [[apps/backend/routes/authRoutes.js]]
- Registration: [[apps/backend/server.js]]
- Auth middleware: [[apps/backend/middleware/auth.js]]
- CSRF middleware: [[apps/backend/middleware/csrf.js]]
- Lockout middleware: [[apps/backend/middleware/accountLockout.js]]

---

## POST /api/auth/logout

### Request

No body required. Requires valid JWT cookie.

### Response

#### 200 OK

```json
{
  "success": true
}
```

Cookies cleared:

- `token` (with original cookie options)
- CSRF token cookie

### Source

- Route module: [[apps/backend/routes/authRoutes.js]]
- Registration: [[apps/backend/server.js]]

---

## GET /api/auth/me

### Request

No parameters. Token extracted from:

1. `Authorization: Bearer <token>` header
2. `token` cookie (fallback)

### Response

#### 200 OK (Authenticated)

```json
{
  "authenticated": true,
  "user": {
    "username": "admin"
  }
}
```

#### 200 OK (Not Authenticated)

```json
{
  "authenticated": false
}
```

> [!note] CSRF Refresh
> On authenticated requests, a new CSRF token is issued to keep the client's CSRF token valid.

### Source

- Route module: [[apps/backend/routes/authRoutes.js]]
- Registration: [[apps/backend/server.js]]
- Auth middleware: [[apps/backend/middleware/auth.js]]

---

## Related

- [[docs/security/authentication|Authentication]]
- [[docs/api/index|API Index]]
- [[docs/adr/adr-004-layered-security-middleware|ADR-004: Layered Security Middleware]]

## PlantUML Diagrams

### Authentication Flow

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

alt Valid Credentials
    Auth -> Auth : signToken()
    Auth --> BE : JWT token
    BE -> BE : Set HTTP-only cookie\nSet CSRF cookie
    BE --> FE : 200 OK
else Invalid Credentials
    Auth --> BE : null
    BE --> FE : 401 Unauthorized
end
@enduml
```

### Session Management

```plantuml
@startuml
!theme plain

participant "Browser" as Browser
participant "Cookie Store" as Cookie
participant "Backend" as BE
participant "JWT Validation" as JWT

note over Browser
  Subsequent requests
end note

Browser -> Cookie : Read token
Cookie --> Browser : token

Browser -> BE : Request\nCookie: token=<jwt>
BE -> JWT : verifyToken()

alt Token Valid
    JWT --> BE : User payload
    BE --> BE : Process request
else Token Expired
    JWT --> BE : Error
    BE --> Browser : 401 Unauthorized
end
@enduml
```
