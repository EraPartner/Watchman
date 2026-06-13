---
title: qBittorrent Integration
type: integration
status: active
date: 2026-06-13
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
- **Composite reachability** — `reachable = service.reachable` — daemon-primary: the Web UI/API probe defines health; the host/ICMP tier is retained for diagnostics only (see [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]])

## Configuration

Service config lives in the DuckDB config store, managed via the Settings UI or the `/config` API. `QBITTORRENT_*` environment variables are legacy — they were imported once on first boot and are now ignored (see [[docs/adr/index|ADR-008 / ADR-015]]).

### Fields

| Field                    | Type     | Default                 | Required | Secret  | Description                                          |
| ------------------------ | -------- | ----------------------- | -------- | ------- | ---------------------------------------------------- |
| `instanceId`             | text     | `main`                  | yes      | no      | Unique identifier for this instance within the kind. |
| `enabled`                | boolean  | `true`                  | no       | no      | Enable or disable polling for this instance.         |
| `baseUrl`                | url      | `http://127.0.0.1:8069` | yes      | no      | Base URL of the qBittorrent Web UI.                  |
| `username`               | text     | `admin`                 | no       | no      | Web UI login username.                               |
| `password`               | password | _(empty)_               | no       | **yes** | Web UI login password (encrypted at rest).           |
| `timeoutMs`              | number   | `5000`                  | no       | no      | Per-request HTTP timeout in milliseconds.            |
| `cacheTtlMs`             | number   | `10000`                 | no       | no      | Response cache TTL in milliseconds.                  |
| `pollPolicy.healthMs`    | number   | `10000`                 | no       | no      | Health check interval in milliseconds.               |
| `pollPolicy.statsMs`     | number   | `30000`                 | no       | no      | Stats poll interval in milliseconds.                 |
| `pollPolicy.jitterRatio` | number   | `0.1`                   | no       | no      | Fractional jitter applied to poll intervals.         |

### Multi-Instance

Add multiple instances of kind `qbittorrent` in the config store, each with a distinct `instanceId`. There is no env-var numbering scheme — all instances are managed through the UI or `/config` API.

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025). Use the `instance` query parameter to target a specific instance.

| Endpoint                                                 | Description                  |
| -------------------------------------------------------- | ---------------------------- |
| `GET /services/qbittorrent/health?instance={instanceId}` | Health check                 |
| `GET /services/qbittorrent/stats?instance={instanceId}`  | Transfer stats, torrent list |

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
