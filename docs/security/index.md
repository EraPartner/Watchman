---
title: Security
type: index
status: active
date: 2026-10-21
tags:
  [
    security,
    index,
    single-user,
    network-isolation,
    cors,
    origin-policy,
    pino-redact,
  ]
description: Index of all security documentation for the Watchman project (single-user, no built-in authentication)
aliases: [security index, security docs]
---

# Security

> [!abstract] Overview
> Watchman is a single-user home-lab application. Built-in authentication has been removed (see [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]]). Security relies on network isolation: firewall rules, VPN, or deployment on a closed local network. In split-deploy mode (Pi backend + Mac client), the backend and client communicate over LAN without TLS; firewall rules and DHCP isolation are critical (see [[docs/adr/018-split-deploy-pi-backend|ADR-018]]).
>
> The security documentation below is **for reference only** and documents the network isolation responsibility, not built-in auth mechanisms.

## Security Index

```dataview
TABLE WITHOUT ID file.link AS "Document", date AS "Date", status AS "Status"
FROM "docs/security"
WHERE type = "security"
SORT file.name ASC
```

## Security Approach (Single-User, No Built-In Auth)

| Responsibility        | Mechanism                                              | Notes                                                     |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| **Network Isolation** | Firewall / VPN / Closed LAN                            | Operator's responsibility; no port forwarding to internet |
| Input Validation      | Parameter sanitization and Zod validation              | All user inputs validated before processing               |
| Browser gate          | Shared origin allow-list + Host-header check           | Blocks cross-site browser requests and DNS rebinding      |
| Logging               | Structured Pino logging with sensitive field redaction | Configuration changes recorded in the DuckDB audit log    |

> [!warning] No Built-In Authentication
> Watchman **does not** have authentication, CSRF protection, HTTP rate-limiting middleware, or account lockout. The WebSocket route only caps upgrade attempts at 30 per IP per minute (`HandshakeLimiter.ts`, answers 429) and open connections at 10 per IP (`ConnectionManager`). Ensure network isolation before running Watchman. See [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] for design rationale.

## Security Features

- **Input Validation** - Zod schema validation and type checking on all endpoints
- **Shared Origin Policy** - Unified allow-list (`watchman://`, loopback, `CORS_ALLOWED_ORIGINS`) enforced by both the HTTP CORS `onRequest` hook and the WebSocket upgrade gate — no split configuration. A cross-origin request from a disallowed origin gets `403` (not only the preflight); a genuine same-origin request (Origin host equals Host) is allowed. See [[apps/backend/src/transport/originPolicy.ts|originPolicy.ts]].
- **Host-Header Check (DNS rebinding)** - Requests are rejected with `403` unless the `Host` header is a loopback name, an IP literal, this machine's hostname (or `<hostname>.local`), or a host listed in `CORS_ALLOWED_ORIGINS`.
- **Request-Scoped AbortController** - Every HTTP request carries a real `AbortController` created by the `requestTimeoutPlugin`. Aborted on timeout (15 s default) or client disconnect; signal threaded into service calls so network I/O is cancelled promptly.
- **Request Body Limit** - Fastify `bodyLimit` of 1 MB
- **WebSocket Connection Cap** - At most 10 WebSocket connections per client address
- **Command Injection Prevention** - Strict validation for SSH/SNMP/ARP commands
- **Structured Logging with Redaction** - Pino `redact` config strips `req.headers.authorization`, `req.headers.cookie`, `set-cookie` response headers, and fields named `password`, `passwd`, `token`, `secret`, `apiKey`, `authHeader` (and their `*.<field>` nested variants) from all log output. See [[apps/backend/src/core/logger.ts|logger.ts]].
- **Master Key Protection** - AES-256-GCM encryption of service secrets at rest. The key comes from `WATCHMAN_MASTER_KEY` or is auto-created at `{DATA_DIR}/master.key`.
- **No Security Headers Middleware** - The backend does not add Helmet, CSP, or HSTS headers. Add them at a reverse proxy if needed.
- **No Network Exposure** - Intended for trusted networks only (operator's responsibility)

## Production Hardening

See [[docs/guides/deployment|Deployment Guide]] for production security checklist.

## Authentication (Removed as of v2.3)

As of v2.3, all built-in authentication has been removed:

- Deleted `useAuth` hook, AuthGuard component, and Login page
- Removed JWT token generation, CSRF validation, and rate-limiting middleware
- Removed `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` environment variables

See [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] for design rationale.

**Security is now the operator's responsibility:** Use firewall rules, VPN, or deployment on a closed local network to prevent unauthorized access.

## LAN-Only Communication (Split Deploy)

When running in split-deploy mode (Electron client paired with Raspberry Pi backend):

- All API calls from Mac to Pi travel over LAN HTTP without TLS
- Configuration secrets are encrypted at rest on the Pi with AES-256-GCM
- Network isolation (VPN, firewall, closed Wi-Fi) prevents unauthorized access
- No support for internet-facing deployments; this is a strict LAN-only mode
- Operator must reserve a DHCP lease or use static IP for the Pi to keep the URL stable

See [[docs/adr/018-split-deploy-pi-backend|ADR-018]] and [[docs/guides/deploying-to-raspberry-pi|Pi Deploy Guide]] for setup guidance.

## Related

- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] — Single-user, no authentication
- [[docs/adr/018-split-deploy-pi-backend|ADR-018]] — Split deploy LAN architecture
- [[docs/architecture/index|Architecture]]
- [[docs/guides/deployment|Deployment Guide]]
- [[docs/guides/deploying-to-raspberry-pi|Pi Deploy Guide]]

## PlantUML Diagrams

### Request Pipeline (Single-User, No Auth)

```plantuml
@startuml
!theme plain

package "Incoming Request" as Request {
    [HTTP Request] as Req
}

package "Transport Hardening" {
    [Host-header check\n(DNS rebinding guard)] as H1
    [Origin Policy (CORS onRequest hook)\nwatchman://, loopback, CORS_ALLOWED_ORIGINS] as C1
    [Log Sampling (/meta/health)] as Log
    [requestTimeoutPlugin\n(AbortController, 15s)] as Timeout
}

package "Request Shaping" {
    [Response Compress (brotli/gzip)] as Compress
    [Error Handler (DomainError→envelope)] as Err
}

package "Application Layer" {
    [Route Handler + Zod Validation] as Valid
}

Req --> H1
H1 --> C1
C1 --> Log
Log --> Timeout
Timeout --> Compress
Compress --> Err
Err --> Valid
@enduml
```

> Historical multi-layer JWT/CSRF/rate-limit/IP-control diagrams were removed in v2.3 per [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]]. See [[docs/security/authentication|Authentication (Superseded)]] for archived flow diagrams.
