---
title: Authentication
type: security
status: active
date: 2026-04-02
tags: [security, authentication, backend, jwt]
description: Authentication system documentation - JWT, cookies, and CSRF protection
aliases: [auth, jwt, csrf, login, authentication]
---

# Authentication

> [!abstract] Overview
> Watchman uses JWT-based authentication with HTTP-only cookies and CSRF protection via the double-submit cookie pattern.

## Authentication Flow

### Login

```
POST /api/auth/login
Body: { username, password }
→ Check account lockout
→ Validate credentials (bcrypt)
→ Generate JWT access token
→ Set HTTP-only cookie
→ Issue CSRF token cookie
→ Return user info
```

### Session Check

```
GET /api/auth/me
→ Check Authorization header or cookie
→ Verify JWT token
→ Return authenticated status
→ Refresh CSRF token
```

### Logout

```
POST /api/auth/logout
→ Clear JWT cookie
→ Clear CSRF cookie
```

## JWT Configuration

| Setting     | Value                                      |
| ----------- | ------------------------------------------ |
| Token type  | Access token                               |
| Cookie name | `token`                                    |
| HttpOnly    | `true`                                     |
| Secure      | `true` (production)                        |
| SameSite    | `strict` (production), `lax` (development) |
| Max Age     | 8 hours                                    |
| Domain      | Derived from FRONTEND_URL                  |

## CSRF Protection

Uses double-submit cookie pattern:

1. Server issues CSRF token as accessible cookie
2. Client reads token and sends in request header
3. Server verifies cookie value matches header value

### Middleware

[[apps/backend/middleware/csrf.js|csrf.js]]:

- `issueCsrfToken(res)` - Generate and set CSRF cookie
- `verifyCsrf` - Middleware to verify CSRF token

## Account Lockout

[[apps/backend/middleware/accountLockout.js|accountLockout.js]]:

- Tracks failed login attempts per username/IP
- Locks account after threshold exceeded
- Prevents brute force attacks

## Password Storage

- bcrypt hashing with configurable cost factor
- Hash comparison on login
- Passwords never stored in plaintext

## Protected Routes

Most API endpoints require authentication via `requireAuth` middleware:

- Stats endpoints
- Control/action endpoints
- Cache management
- Security administration

## Related

- [[docs/security/rate-limiting|Rate Limiting]]
- [[docs/security/ip-control|IP Control]]
- [[docs/architecture/data-flow|Data Flow]]

## PlantUML Diagrams

### Complete Authentication Flow

```plantuml
@startuml
!theme plain

actor "User" as User
participant "Frontend" as FE
participant "Backend" as BE
participant "Auth Middleware" as Auth
participant "Account Lockout" as Lockout
participant "bcrypt" as BCrypt
database "Environment" as Env

User -> FE : Enter credentials
FE -> BE : POST /api/auth/login\n(username, password)

BE -> Lockout : Check lockout status

alt Account Locked
    Lockout --> BE : Locked
    BE --> FE : 429 Too Many Attempts
else Not Locked
    Lockout -> Auth : authenticateCredentials()
    Auth -> Env : Get AUTH_USERNAME\nAUTH_PASSWORD_HASH

    Auth -> BCrypt : Compare passwords

    alt Valid
        BCrypt --> Auth : Match
        Auth -> Auth : signToken()
        Auth --> BE : JWT token
        BE -> BE : Set HTTP-only cookie\nSet CSRF cookie
        BE --> FE : 200 OK
    else Invalid
        BCrypt --> Auth : No match
        Auth -> Lockout : Increment failures
        alt Threshold Exceeded
            Lockout -> Lockout : Lock account
        end
        Auth --> BE : null
        BE --> FE : 401 Unauthorized
    end
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

note over Browser
  Initial login
end note

Browser -> BE : POST /api/auth/login
BE --> Browser : Set-Cookie: token=jwt\nSet-Cookie: csrf-token=abc123

note over Browser
  Subsequent requests
end note

Browser -> FE : POST request
FE -> FE : Read csrf-token cookie
FE -> BE : POST /api/action\nX-CSRF-Token: abc123\nCookie: csrf-token=abc123

BE -> BE : Compare tokens

alt Match
    BE -> BE : Process request
    BE --> FE : 200 OK
else No Match
    BE --> FE : 403 Forbidden
end
@enduml
```

### Session Lifecycle

```plantuml
@startuml
!theme plain

state "Not Authenticated" as Unauth
state "Authenticated" as Auth
state "Locked" as Locked
state "Expired" as Expired

[*] --> Unauth

Unauth --> Auth : Successful login
Unauth --> Locked : Too many failures

Auth --> Unauth : Logout
Auth --> Expired : Token expires (8 hours)
Auth --> Locked : Failed action attempts

Locked --> Unauth : Lockout timeout

Expired --> Unauth : Re-login required
@enduml
```
