---
title: Roon Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: Roon music server integration with multi-instance support
aliases: [roon, roon server, music server]
---

# Roon Integration

> [!abstract] Overview
> Monitors Roon music server with multi-instance support.

## Configuration

```bash
ROON_HOST=192.0.2.150
ROON_PORTS=9003,9330,9100
```

## Endpoints

| Endpoint               | Description        | Auth              |
| ---------------------- | ------------------ | ----------------- |
| `GET /api/roon/status` | Health check       | No (rate limited) |
| `GET /api/roon/stats`  | Server info, zones | Yes               |

## Service Class

[[apps/backend/services/RoonService.js|RoonService.js]]

### Methods

- `checkHealth()` - Port connectivity check
- `getStats()` - Server status, active zones

## Frontend Component

[[apps/frontend/src/components/RoonCard.tsx|RoonCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
