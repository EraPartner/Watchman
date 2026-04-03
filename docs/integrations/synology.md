---
title: Synology Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: Synology NAS integration with multi-instance support
aliases: [synology, nas, synology nas]
---

# Synology Integration

> [!abstract] Overview
> Monitors Synology NAS devices with multi-instance support.

## Configuration

### Single Instance

```bash
SYNOLOGY_HOST=192.0.2.100
SYNOLOGY_PORT=5000
SYNOLOGY_USERNAME=your-username
SYNOLOGY_PASSWORD=your-password
```

### Multi-Instance

```bash
SYNOLOGY_1_HOST=192.0.2.100
SYNOLOGY_1_PORT=5000
SYNOLOGY_1_USERNAME=admin
SYNOLOGY_1_PASSWORD=password1
SYNOLOGY_2_HOST=192.0.2.101
SYNOLOGY_2_PORT=5000
SYNOLOGY_2_USERNAME=admin
SYNOLOGY_2_PASSWORD=password2
```

## Endpoints

| Endpoint                   | Description                | Auth              |
| -------------------------- | -------------------------- | ----------------- |
| `GET /api/synology/status` | Health check               | No (rate limited) |
| `GET /api/synology/stats`  | System stats, storage info | Yes               |

## Service Class

[[apps/backend/services/SynologyService.js|SynologyService.js]]

### Methods

- `checkHealth()` - DSM API connection test
- `getStats()` - CPU, memory, storage, system info

## Frontend Component

[[apps/frontend/src/components/SynologyCard.tsx|SynologyCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/features/multi-instance|Multi-Instance Support]]
