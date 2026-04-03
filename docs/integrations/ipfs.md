---
title: IPFS Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: IPFS node integration for Watchman
aliases: [ipfs, interplanetary file system, ipfs node]
---

# IPFS Integration

> [!abstract] Overview
> Monitors an IPFS (InterPlanetary File System) node.

## Configuration

```bash
IPFS_API_URL=http://127.0.0.1:5001
```

## Endpoints

| Endpoint                | Description       | Auth                |
| ----------------------- | ----------------- | ------------------- |
| `GET /api/ipfs/status`  | Health check      | No (rate limited)   |
| `GET /api/ipfs/stats`   | Node statistics   | Yes                 |
| `GET /api/ipfs/updates` | Check for updates | Yes (auth required) |

## Service Class

[[apps/backend/services/IpfsService.js|IpfsService.js]]

### Methods

- `checkHealth()` - IPFS API connection test
- `getStats()` - Node info, peer count, storage
- `checkForUpdates()` - Check for IPFS updates

## Frontend Component

[[apps/frontend/src/components/IpfsCard.tsx|IpfsCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
