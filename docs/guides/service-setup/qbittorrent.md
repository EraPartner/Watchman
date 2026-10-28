---
title: Set up qBittorrent
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, qbittorrent, web-ui, credentials]
description: Enable the qBittorrent Web UI and add it to Watchman
aliases: [qbittorrent setup, set up qbittorrent]
---

# Set up qBittorrent

> [!abstract] What Watchman reads
> After a login (`POST /api/v2/auth/login`), only `GET` calls: `app/version`, `app/preferences`,
> `sync/maindata` (incremental) and warning/critical lines from `log/main`
> (`apps/backend/src/domain/services/qbittorrent/QBittorrentService.ts`). It never adds, pauses or
> removes torrents. Details: [[docs/integrations/qbittorrent|qBittorrent integration]].

## 1. Prepare qBittorrent

In qBittorrent: **Tools → Options → Web UI**.

1. Tick **Web User Interface (Remote control)**.
2. Set **IP address** to the LAN address (or `*`) and note the **Port** (qBittorrent's default is
   `8080`).
3. Under **Authentication**, set a user name and a long, unique password. Since qBittorrent 4.6.1
   there's no default password; a fresh install prints a temporary one in its log.

For `qbittorrent-nox`, the same settings live in the Web UI itself or in `qBittorrent.conf`.

## 2. Credentials

qBittorrent has a single Web UI account with full control, and no read-only option. Use that
account, keep the Web UI on your LAN, and don't reuse the password elsewhere.

Leave **Bypass authentication for clients on localhost / in whitelisted IP subnets** off for the
Watchman host: Watchman always logs in and expects the session cookie the login returns.

If **Ban client after consecutive failures** is on, a wrong password in Watchman can get the
Watchman machine banned for the configured time.

## 3. Add it in Watchman

**Settings → Services → + Add service → qBittorrent**

| Field    | Enter                                                                                  |
| -------- | -------------------------------------------------------------------------------------- |
| Base URL | `http://<host>:<port>`. Watchman's form default is `http://127.0.0.1:8069`; change the port to match step 1. |
| Username | The Web UI user name                                                                   |
| Password | The Web UI password                                                                    |

## 4. Check it works

After saving, the tile's service dot turns green and the tile shows qBittorrent's version, transfer
speeds and torrent counts.

## Troubleshooting

| Symptom                                   | Likely cause                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `qbittorrent auth returned 403`           | The Watchman machine is banned after failed logins. Wait or restart qBittorrent, then fix the password. |
| `qbittorrent login missing set-cookie`    | Wrong user name or password (qBittorrent answers `Fails.` without a cookie).    |
| Connection refused                        | Web UI is off, wrong port, or it listens on another interface.                  |
| `returned 401` on every call              | Host header validation rejects the host name in the Base URL. Use the IP, or add the name under **Server domains**. |

> [!warning] Unverified
> The ban and Host-header rows are based on qBittorrent's documented options, not on a test against
> a live client.

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/qbittorrent|qBittorrent integration]]
