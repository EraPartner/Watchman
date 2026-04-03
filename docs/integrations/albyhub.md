---
title: Alby Hub Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: Alby Hub Lightning wallet integration with multi-instance support
aliases: [alby hub, lightning, bitcoin lightning, wallet]
---

# Alby Hub Integration

> [!abstract] Overview
> Monitors Alby Hub Lightning wallet with multi-instance support.

## Configuration

```bash
ALBYHUB_URL=http://127.0.0.1:8080
ALBYHUB_TOKEN=your-albyhub-token
```

## Endpoints

| Endpoint                  | Description       | Auth              |
| ------------------------- | ----------------- | ----------------- |
| `GET /api/albyhub/status` | Health check      | No (rate limited) |
| `GET /api/albyhub/stats`  | Wallet statistics | Yes               |

## Service Class

[[apps/backend/services/AlbyHubService.js|AlbyHubService.js]]

### Methods

- `checkHealth()` - API connection test
- `getStats()` - Wallet balance, channel info

## Frontend Component

[[apps/frontend/src/components/AlbyHubCard.tsx|AlbyHubCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
