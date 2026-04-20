---
title: Router Integration
type: integration
status: active
date: 2026-04-09
tags: [integration, services, backend, monitoring]
description: Network router integration (Beryl/Telenet) with ARP lookup
aliases: [router, beryl, telenet, arp, network]
---

# Router Integration

> [!abstract] Overview
> Monitors network routers (Beryl, Telenet) with ARP/neighbor lookup capabilities.

## Configuration

### Beryl

```bash
BERYL_HOST=192.0.2.1
BERYL_PORTS=80,443
```

### Telenet

```bash
TELENET_HOST=192.0.2.1
TELENET_PORTS=80
```

## Endpoints

| Endpoint                                     | Description         | Auth              |
| -------------------------------------------- | ------------------- | ----------------- |
| `GET /api/beryl/status`                      | Health check        | No (rate limited) |
| `GET /api/beryl/stats`                       | Router statistics   | Yes               |
| `GET /api/telenet/status`                    | Health check        | No (rate limited) |
| `GET /api/telenet/stats`                     | Router statistics   | Yes               |
| `GET /api/router/arp?service=beryl\|telenet` | ARP/neighbor lookup | Yes + CSRF        |

## Service Class

`RouterService` (`apps/backend/src/domain/services/`)

### Methods

- `checkHealth()` - Port connectivity check
- `getStats()` - Router info, connected devices

### ARP Lookup

The `/api/router/arp` endpoint performs network neighbor discovery:

- Uses `ip neigh` (Linux) or `arp -a` (macOS)
- Uses a short-lived in-memory TTL cache (3s) in `RouterArpService` to reduce repeated ARP command executions during rapid refreshes
- Cache pruning is bounded with a max-entry limit to avoid unbounded memory growth while preserving TTL behavior
- Filters by router's interface or subnet
- Returns paginated results with LAN-specific subset
- Strict service validation prevents command injection

## Security

- Only `beryl` and `telenet` services are allowed for ARP lookup
- Requires authentication + CSRF verification
- Input validation prevents command injection
- Host IP validated as proper IPv4 address

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/security/index|Security]]
