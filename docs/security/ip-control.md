---
title: IP Control
type: security
status: active
date: 2026-04-10
tags: [security, ip-control, backend]
description: IP whitelist/blacklist enforcement documentation
aliases: [ip control, ip whitelist, ip blacklist, access control]
---

# IP Control

> [!abstract] Overview
> Watchman supports IP-based access control through whitelists and blacklists for sensitive endpoints.

## Implementation

[[apps/backend/middleware/ipControl.js|ipControl.js]]
[[apps/backend/utils/ip.js|ip.js]]

### Middleware Functions

| Function               | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `requireWhitelistedIP` | Blocks requests from non-whitelisted IPs   |
| `enforceIPControl`     | Applies both whitelist and blacklist rules |

### IP Normalization

- Request IP extraction now uses `getRequestIp(req)` from [[apps/backend/utils/ip.js]]
- Stored and compared whitelist/blacklist/temp-block entries are normalized through `normalizeIp(...)`
- Localhost detection for startup-safe behavior uses `isLocalhostIp(...)`
- Equivalent representations (for example `::ffff:127.0.0.1` and `127.0.0.1`) are treated as the same IP

## Configuration

IP control is configured via environment variables:

```bash
# Comma-separated list of allowed IPs
IP_WHITELIST=192.168.1.0/24,10.0.0.1

# Comma-separated list of blocked IPs
IP_BLACKLIST=192.168.1.100
```

## Usage

### Security Administration

Endpoints requiring IP whitelist:

- `GET /api/security/alerts`
- `GET /api/security/stats`

### General Enforcement

`enforceIPControl` middleware is applied early in the stack for all requests.

Middleware registration source: [[apps/backend/bootstrap/configureMiddleware.js]], invoked from [[apps/backend/server.js]].

## Related

- [[docs/security/index|Security]]
- [[docs/security/rate-limiting|Rate Limiting]]

## PlantUML Diagrams

### IP Control Flow

```plantuml
@startuml
!theme plain

participant "Request" as Req
participant "IP Control" as IPC
participant "Whitelist" as WL
participant "Blacklist" as BL

Req -> IPC : Check IP address

IPC -> IPC : Extract client IP

alt IP in Blacklist
    IPC --> Req : 403 Forbidden\n"IP address blocked"
else IP not in Blacklist
    IPC -> WL : Check whitelist
    alt Whitelist empty
        IPC --> Req : Allow (no whitelist configured)
    else IP in Whitelist
        IPC --> Req : Allow
    else IP not in Whitelist
        IPC --> Req : 403 Forbidden\n"IP not allowed"
    end
end
@enduml
```

### CIDR Range Matching

```plantuml
@startuml
!theme plain

participant "Request" as Req
participant "IP Control" as IPC
participant "CIDR Parser" as CIDR

Req -> IPC : IP: 192.168.1.50

IPC -> CIDR : Check against whitelist\n192.168.1.0/24

CIDR -> CIDR : Parse CIDR notation
CIDR -> CIDR : Convert to network range
CIDR -> CIDR : Check if IP in range

note right of CIDR
  192.168.1.0/24
  Matches: 192.168.1.0-255
end note

CIDR --> IPC : IP matches range
IPC --> Req : Allow
@enduml
```
