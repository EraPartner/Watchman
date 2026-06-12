---
title: qBittorrent Integration
type: integration
status: active
date: 2026-06-12
tags:
  [
    integration,
    services,
    backend,
    monitoring,
    two-tier,
    icmp,
    http,
    incremental-sync,
    per-torrent-stats,
    log-events,
    ttl-memo,
  ]
description: qBittorrent client integration with two-tier health model, incremental delta sync, per-torrent stats, log event capture, and memoized app metadata
aliases: [qbittorrent, bittorrent, torrent, downloads]
---

# qBittorrent Integration

> [!abstract] Overview
> Monitors qBittorrent torrent client with two-tier health model (ICMP + HTTP probe) and support for multiple instances.

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to qBittorrent host
- **Service tier** — HTTP `/api/v2/app/webapiVersion` probe
- **Composite reachability** — `host.reachable AND service.reachable`

## Configuration

### Single Instance

```bash
QBITTORRENT_URL=http://127.0.0.1:8069
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-password
QBITTORRENT_TIMEOUT=10000  # optional, default 10s
```

### Multi-Instance

```bash
QBITTORRENT_1_URL=http://192.0.2.10:8080
QBITTORRENT_1_USERNAME=admin
QBITTORRENT_1_PASSWORD=password1
QBITTORRENT_1_TIMEOUT=10000
QBITTORRENT_2_URL=http://192.0.2.11:8080
QBITTORRENT_2_USERNAME=admin
QBITTORRENT_2_PASSWORD=password2
QBITTORRENT_2_TIMEOUT=10000
```

## Endpoints

| Endpoint                        | Description                  | Auth              |
| ------------------------------- | ---------------------------- | ----------------- |
| `GET /api/qbittorrent/status`   | Health check                 | No (rate limited) |
| `GET /api/qbittorrent/stats`    | Transfer stats, torrent list | Yes               |
| `GET /api/qbittorrent_N/status` | Instance health              | No (rate limited) |
| `GET /api/qbittorrent_N/stats`  | Instance stats               | Yes               |

## Incremental Delta Sync (QB1)

QB1 implements efficient state synchronization using qBittorrent's incremental maindata endpoint:

- **`/api/v2/sync/maindata?rid={rid}`** — Server returns `full_update: true` on init or state reset; delta otherwise. On full update, service replaces cached state. On delta, service merges `server_state` and merges each torrent **field-wise** (deltas carry only changed fields per torrent), removing entries from `torrents_removed`. Transfer speeds and session totals come from `server_state` inside maindata — `/api/v2/transfer/info` is no longer fetched.
- **`activeTorrents`** — derived from the synced maindata cache (no extra `/torrents/info` fetch per poll): torrents with non-zero combined dl+ul speed, sorted by combined speed, top 20. Each entry carries hash, name, state, progress, dlspeed, upspeed, size, downloaded, uploaded, eta, category.
- **`/api/v2/log/main?type=12&last_known_id={lastLogId}`** — Log entries of type warning (4) and critical (8). Persisted cursor (lastLogId) prevents re-fetch.

Steady-state polling therefore requires only **2 outbound requests per cycle**: incremental maindata + log cursor.

## Memoized App Metadata

`app/version` and `app/preferences` are fetched once and memoized for **1 hour** via `core/ttlMemo.ts` (see [[docs/reference/code-patterns#ttlmemo--slow-lane-memoization|Code Patterns — ttlMemo]]). They are not re-fetched on every poll cycle; a forced refresh happens automatically after the TTL expires.

## Stats Response

`getStats()` returns these new metrics:

| Metric           | Type          | Description                                   |
| ---------------- | ------------- | --------------------------------------------- |
| `torrentsError`  | number        | Count of torrents in error/missingFiles state |
| `activeTorrents` | TorrentInfo[] | Top 20 torrents by combined dl+ul speed       |
| `recentErrors`   | string[]      | Critical log messages since last poll         |
| `recentWarnings` | string[]      | Warning log messages since last poll          |

Plus existing metrics: version, uptime, torrentsTotal, torrentsDownloading, torrentsSeeding, torrentsPaused, torrentsCompleted, dlSpeed, upSpeed, dlData, upData, connectionStatus, listenPort, dhtNodes, freeSpaceOnDisk.

## Service Class

`apps/backend/src/domain/services/qbittorrent/QBittorrentService.ts`

### Methods

- `checkHealth()` - API connection test (ICMP + HTTP probe)
- `getStats()` - Download/upload speeds, per-torrent details, error/warning logs

### Internal State

- `rid` — Incremental sync cursor; updated from maindata responses
- `lastLogId` — Log entry cursor; prevents re-fetching duplicate messages
- `cachedServerState` — Merged server state across delta updates
- `cachedTorrents` — Merged torrent map across delta updates (full_update replaces; delta merges and filters)

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Two-Tier Health Model]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/features/multi-instance|Multi-Instance Support]]
- [[docs/api/services-health|Services Health API]]
- [[docs/reference/code-patterns#ttlmemo--slow-lane-memoization|Code Patterns — ttlMemo]]
- [[docs/performance/caching-strategies|Caching Strategies]]
