---
title: Mac Mini Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: Mac Mini server integration with SSH access
aliases: [mac mini, macos server, ssh]
---

# Mac Mini Integration

> [!abstract] Overview
> Monitors a Mac Mini server via SSH with multi-instance support.

## Configuration

```bash
MACMINI_HOST=127.0.0.1
MACMINI_SSH_USER=your-username
MACMINI_SSH_KEY_PATH=/path/to/your/ssh/key
```

## Endpoints

| Endpoint                  | Description          | Auth              |
| ------------------------- | -------------------- | ----------------- |
| `GET /api/macmini/status` | Health check         | No (rate limited) |
| `GET /api/macmini/stats`  | System stats via SSH | Yes               |

## Service Class

`apps/backend/services/MacMiniService.js`

### Methods

- `checkHealth()` - SSH connection test
- `getStats()` - System metrics via SSH commands

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/integrations/index|Service Integrations]]
