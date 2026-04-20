---
title: Tor Integration
type: integration
status: active
date: 2026-04-11
tags: [integration, services, backend, monitoring]
description: Tor relay and proxy integration for Watchman
aliases: [tor, tor relay, onion, tor proxy]
---

# Tor Integration

> [!abstract] Overview
> Monitors Tor relay status and manages the Tor proxy for other services (e.g., Bitcoin over Tor).

## Configuration

```bash
TOR_RELAY_NICKNAME=your-relay-nickname
TOR_RELAY_IP=your-ip-address
```

## Endpoints

| Endpoint                       | Description         | Auth              |
| ------------------------------ | ------------------- | ----------------- |
| `GET /api/tor/status`          | Health check        | No (rate limited) |
| `GET /api/tor/stats`           | Relay statistics    | Yes               |
| `GET /api/tor/health`          | Health alias        | No (rate limited) |
| `GET /api/tor/relay/:nickname` | Specific relay info | Yes               |
| `GET /api/tor/updates`         | Check for updates   | Yes               |

## Service Classes

- `TorService` — Tor relay monitoring (`apps/backend/src/domain/services/`)
- `TorManager` — Tor proxy management (`apps/backend/src/domain/services/`)

### TorService Methods

- `checkHealth()` - Check Tor daemon status
- `getStats()` - Relay bandwidth, consensus info
- `checkForUpdates()` - Check for Tor updates

### TorManager Methods

- `initialize()` - Set up Tor proxy
- `startTor()` - Start Tor process
- `checkHealth()` - Verify proxy is running via SOCKS port probe
- `cleanup()` - Graceful shutdown; remove generated `torrc` while preserving Tor cache/state files

### Runtime Behavior

- Default Tor data directory is module-relative: `apps/backend/.tor-data` (see `TorManager`)
- Runtime root-level `.tor-data/` artifacts are ignored in git at repository root via [[.gitignore]]
- SOCKS readiness/health checks use a local TCP socket probe on `127.0.0.1:{port}` instead of shelling out to `lsof`
- Startup readiness polling uses backoff (`250ms` doubling up to `1000ms`) until timeout (`startupTimeout`)

### Test Coverage Notes

- `TorManager` colocated test covers lifecycle/error-path coverage:
  - `isInstalled()` fallback from `which tor` to Homebrew detection
  - `installTor()` success and failure paths
  - `startTor()` bootstrap log handling from stdout/stderr plus child-process `error` path
  - `cleanup()` warning-path behavior when success logger throws

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/integrations/bitcoin|Bitcoin Integration]]
