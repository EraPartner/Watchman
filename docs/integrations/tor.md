---
title: Tor Integration
type: integration
status: active
date: 2026-04-09
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

- [[apps/backend/services/TorService.js|TorService.js]] - Tor relay monitoring
- [[apps/backend/services/TorManager.js|TorManager.js]] - Tor proxy management

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

- Default Tor data directory is module-relative: `apps/backend/.tor-data` (see [[apps/backend/services/TorManager.js|TorManager.js]])
- Runtime root-level `.tor-data/` artifacts are ignored in git at repository root via [[.gitignore]]
- SOCKS readiness/health checks use a local TCP socket probe on `127.0.0.1:{port}` instead of shelling out to `lsof`
- Startup readiness polling uses backoff (`250ms` doubling up to `1000ms`) until timeout (`startupTimeout`)

## Frontend Component

[[apps/frontend/src/components/TorCard.tsx|TorCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/integrations/bitcoin|Bitcoin Integration]]
