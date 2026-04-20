---
title: Backend Utilities
type: reference
status: superseded
date: 2026-04-02
superseded_by: docs/adr/013-backend-rewrite-typescript-fastify
superseded_date: 2026-04-20
tags: [reference, backend, utilities, utils]
description: Reference documentation for all backend utility modules - circuit breaker, validation, pagination, and more
aliases: [utilities, utils, backend utils, helper functions]
---

# Backend Utilities

> [!danger] Superseded — No Longer Implemented
> This document describes **v1 backend utility modules** (`apps/backend/utils/*.js`). The backend was rewritten to TypeScript + Fastify 4 in v2.0; utilities are now in `apps/backend/src/infra/` (see [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]]). Content retained for archival reference only.


> [!abstract] Overview
> The Watchman backend includes several utility modules that provide shared functionality across services and middleware. This document covers all utility modules.

## Utility Modules

| Utility            | File                                        | Description                                |
| ------------------ | ------------------------------------------- | ------------------------------------------ |
| Circuit Breaker    | `apps/backend/utils/circuitBreaker.js`    | Fault tolerance for external service calls |
| Validation         | `apps/backend/utils/validation.js`        | Input sanitization and validation          |
| Pagination         | `apps/backend/utils/pagination.js`        | API response pagination                    |
| Security           | `apps/backend/utils/security.js`          | Security helpers (IPs, sanitization)       |
| Version Comparison | `apps/backend/utils/versionComparison.js` | Software version comparison                |
| Ping               | `apps/backend/utils/ping.js`              | ICMP ping functionality                    |
| HTTP Agent Pool    | `apps/backend/utils/httpAgentPool.js`     | HTTP/HTTPS connection pooling              |
| Service Utils      | `apps/backend/utils/serviceUtils.js`      | Service-specific utilities                 |

## Circuit Breaker

`apps/backend/utils/circuitBreaker.js` implements the circuit breaker pattern to prevent cascading failures when external services are unavailable.

### States

| State       | Description       | Behavior                         |
| ----------- | ----------------- | -------------------------------- |
| `CLOSED`    | Normal operation  | Requests pass through normally   |
| `OPEN`      | Too many failures | Requests are blocked immediately |
| `HALF_OPEN` | Testing recovery  | Limited requests allowed to test |

### Configuration

```javascript
const breaker = new CircuitBreaker({
  failureThreshold: 5, // Failures before opening (default: 5)
  successThreshold: 3, // Successes to close from half-open (default: 3)
  timeout: 30000, // ms before half-open (default: 30s)
  monitorWindow: 60000, // Time window to track failures (default: 60s)
});
```

### Usage

```javascript
const result = await breaker.execute(() => service.checkHealth());
```

### Integration

Used by `apps/backend/services/ServiceManager.js` (ServiceManager) to protect service calls:

```javascript
// In ServiceManager.getServiceHealth()
const breaker = this.getCircuitBreaker(serviceName);
const health = await breaker.execute(() => service.checkHealth());
```

## Validation

`apps/backend/utils/validation.js` provides input sanitization to prevent injection attacks.

### Functions

| Function                           | Description                     | Returns            |
| ---------------------------------- | ------------------------------- | ------------------ |
| `sanitizeString(input, maxLength)` | Remove control characters, trim | `string` or `null` |
| `validateIPAddress(ip)`            | Validate IPv4/IPv6 address      | `boolean`          |
| `validatePort(port)`               | Validate port number (1-65535)  | `boolean`          |
| `validateHostname(hostname)`       | Validate hostname/domain        | `boolean`          |
| `sanitizeCommandArg(arg)`          | Sanitize command arguments      | `string`           |

### Usage

```javascript
import { validateIPAddress, sanitizeString } from "../utils/validation.js";

// Validate user input
if (!validateIPAddress(req.query.ip)) {
  return res.status(400).json({ error: "Invalid IP address" });
}

// Sanitize string input
const safeInput = sanitizeString(userInput, 100);
```

## Pagination

`apps/backend/utils/pagination.js` provides pagination for API endpoints returning large lists.

### Functions

| Function                         | Description             |
| -------------------------------- | ----------------------- |
| `paginate(items, options)`       | Offset-based pagination |
| `cursorPaginate(items, options)` | Cursor-based pagination |

### Options

```javascript
{
  page: 1,          // Current page (1-indexed)
  limit: 20,       // Items per page (max 100)
  sortBy: "name",  // Field to sort by
  sortOrder: "asc" // "asc" or "desc"
}
```

### Response Format

```javascript
{
  data: [...],
  pagination: {
    page: 1,
    limit: 20,
    total: 150,
    totalPages: 8,
    hasNext: true,
    hasPrev: false
  }
}
```

## Security

`apps/backend/utils/security.js` provides security-related helper functions.

### Functions

| Function                | Description                          |
| ----------------------- | ------------------------------------ |
| `isValidIP(ip)`         | Validate IP address format           |
| `isLocalhostIP(ip)`     | Check if IP is localhost             |
| `getClientIP(req)`      | Extract client IP from request       |
| `redactSensitive(data)` | Redact sensitive values from objects |

## Version Comparison

`apps/backend/utils/versionComparison.js` compares software version strings.

### Functions

| Function                             | Description                          |
| ------------------------------------ | ------------------------------------ |
| `compareVersions(v1, operator, v2)`  | Compare versions (>, <, >=, <=, ===) |
| `isUpdateAvailable(current, latest)` | Check if update available            |
| `parseVersion(version)`              | Parse version string to components   |

### Usage

```javascript
import {
  compareVersions,
  isUpdateAvailable,
} from "../utils/versionComparison.js";

const hasUpdate = isUpdateAvailable("v0.107.8", "v0.108.0");
// Returns: true
```

## Ping

`apps/backend/utils/ping.js` provides ICMP ping functionality for network diagnostics.

### Functions

| Function              | Description         |
| --------------------- | ------------------- |
| `ping(host, options)` | Ping a host         |
| `pingMultiple(hosts)` | Ping multiple hosts |

### Options

```javascript
{
  timeout: 3000,   // Timeout in ms
  packetSize: 56,  // Packet size
  count: 1         // Number of pings
}
```

## HTTP Agent Pool

`apps/backend/utils/httpAgentPool.js` manages HTTP/HTTPS connection pooling.

### Purpose

- Reuses HTTP connections for better performance
- Manages connection limits per host
- Handles keep-alive connections

### Usage

```javascript
import { getAgent } from "../utils/httpAgentPool.js";

const agent = getAgent("https://api.example.com");
const response = await fetch(url, { agent });
```

## Related

- [[docs/architecture/backend-architecture|Backend Architecture]]
- [[docs/performance/caching-strategies|Caching Strategies]]
- [[docs/security/index|Security]]
