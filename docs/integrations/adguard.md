---
title: AdGuard Home Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: AdGuard Home DNS ad blocker integration for Watchman
aliases: [adguard, adguard home, dns, ad blocker]
---

# AdGuard Home Integration

> [!abstract] Overview
> Monitors AdGuard Home DNS-level ad blocker, providing query statistics, filter status, and protection toggle control.

## Configuration

```bash
ADGUARD_MAIN_URL=http://192.0.2.1
ADGUARD_MAIN_AUTH=your-adguard-auth-token
ADGUARD_TIMEOUT=10000  # optional, default 10s
```

## Endpoints

| Endpoint                       | Description              | Auth              |
| ------------------------------ | ------------------------ | ----------------- |
| `GET /api/adguard/status`      | Health check             | No (rate limited) |
| `GET /api/adguard/stats`       | Query stats, filter info | Yes               |
| `POST /api/adguard/protection` | Toggle protection        | Yes + CSRF        |
| `GET /api/adguard/updates`     | Check for updates        | Yes               |

## Service Class

[[apps/backend/services/AdGuardService.js|AdGuardService.js]]

### Methods

- `checkHealth()` - Pings AdGuard Home API, returns protection status
- `getStats()` - Returns query counts, blocked percentage, filter info
- `setProtection(enabled, duration)` - Toggle filtering with optional duration
- `checkForUpdates()` - Check for AdGuard Home updates

## Frontend Component

[[apps/frontend/src/components/AdGuardCard.tsx|AdGuardCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/features/service-monitoring|Service Monitoring]]
