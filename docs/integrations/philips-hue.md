---
title: Philips Hue Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: Philips Hue Bridge integration with multi-instance support
aliases: [philips hue, hue bridge, smart lighting]
---

# Philips Hue Integration

> [!abstract] Overview
> Monitors Philips Hue Bridge with multi-instance support.

## Configuration

```bash
PHILIPS_BRIDGE_HOST=192.0.2.200
```

## Endpoints

| Endpoint                  | Description         | Auth              |
| ------------------------- | ------------------- | ----------------- |
| `GET /api/philips/status` | Health check        | No (rate limited) |
| `GET /api/philips/stats`  | Bridge info, lights | Yes               |

## Service Class

[[apps/backend/services/PhilipsBridgeService.js|PhilipsBridgeService.js]]

### Methods

- `checkHealth()` - Bridge connectivity test
- `getStats()` - Bridge info, connected lights

## Frontend Component

[[apps/frontend/src/components/PhilipsBridgeCard.tsx|PhilipsBridgeCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
