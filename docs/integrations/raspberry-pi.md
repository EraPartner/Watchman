---
title: Raspberry Pi Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: Raspberry Pi device integration with SSH access
aliases: [raspberry pi, rpi, pi device]
---

# Raspberry Pi Integration

> [!abstract] Overview
> Monitors a Raspberry Pi device via SSH with multi-instance support.

## Configuration

```bash
RASPI_HOST=192.0.2.230
RASPI_PORT=22
```

## Endpoints

| Endpoint                | Description          | Auth              |
| ----------------------- | -------------------- | ----------------- |
| `GET /api/raspi/status` | Health check         | No (rate limited) |
| `GET /api/raspi/stats`  | System stats via SSH | Yes               |

## Service Class

[[apps/backend/services/RaspberryPiService.js|RaspberryPiService.js]]

### Methods

- `checkHealth()` - SSH connection test
- `getStats()` - System metrics via SSH commands

## Frontend Component

[[apps/frontend/src/components/RaspberryPiCard.tsx|RaspberryPiCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
