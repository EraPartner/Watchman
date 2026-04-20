---
title: qBittorrent Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: qBittorrent client integration with multi-instance support
aliases: [qbittorrent, bittorrent, torrent, downloads]
---

# qBittorrent Integration

> [!abstract] Overview
> Monitors qBittorrent torrent client with support for multiple instances.

## Configuration

### Single Instance

```bash
QBITTORRENT_URL=http://127.0.0.1:8069
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-password
```

### Multi-Instance

```bash
QBITTORRENT_1_URL=http://192.0.2.10:8080
QBITTORRENT_1_USERNAME=admin
QBITTORRENT_1_PASSWORD=password1
QBITTORRENT_2_URL=http://192.0.2.11:8080
QBITTORRENT_2_USERNAME=admin
QBITTORRENT_2_PASSWORD=password2
```

## Endpoints

| Endpoint                        | Description                  | Auth              |
| ------------------------------- | ---------------------------- | ----------------- |
| `GET /api/qbittorrent/status`   | Health check                 | No (rate limited) |
| `GET /api/qbittorrent/stats`    | Transfer stats, torrent list | Yes               |
| `GET /api/qbittorrent_N/status` | Instance health              | No (rate limited) |
| `GET /api/qbittorrent_N/stats`  | Instance stats               | Yes               |

## Service Class

`apps/backend/services/QBittorrentService.js`

### Methods

- `checkHealth()` - API connection test
- `getStats()` - Download/upload speeds, active torrents

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/features/multi-instance|Multi-Instance Support]]
