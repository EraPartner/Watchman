---
title: Set up Roon
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, roon, extension, pairing]
description: Add a Roon Core to Watchman and optionally approve the Watchman extension for zone data
aliases: [roon setup, set up roon, roon extension]
---

# Set up Roon

> [!abstract] What Watchman reads
> - **Always:** ICMP ping and a TCP connect to the Core's ports (default `9100`). The Core counts as
>   up if either answers.
> - **With "Use Roon API":** Watchman registers as a Roon extension called **Watchman** and
>   subscribes to zone updates (playing state, now playing). It sends no playback commands
>   (`apps/backend/src/domain/services/roon/RoonService.ts`, `apps/backend/src/infra/roon/roonClientImpl.ts`).
>
> Details: [[docs/integrations/roon|Roon integration]].

## 1. Prepare the Core

Give the machine running Roon Server / Roon Core a fixed IP address. Nothing else is needed for the
reachability check.

## 2. Credentials

None. For zone data, Roon uses extension approval instead of passwords:

1. Add the service in Watchman with **Use Roon API** ticked (step 3) and save.
2. In a Roon app: **Settings → Extensions**. **Watchman** appears in the list; click **Enable**.

Roon has no read-only extension type. The Watchman extension declares the transport service because
the zone subscription is part of it, which in Roon's model also allows playback control. Watchman
only subscribes to zones. Approval is a one-time setup step; you can disable the extension in the
same Roon screen at any time.

> [!warning] Unverified
> Roon pairing was not tested against a live Core. The Roon API library keeps the pairing token on
> disk; Watchman doesn't set where. If Roon asks you to enable the extension again after every
> Watchman restart, the token isn't being kept: report it.

## 3. Add it in Watchman

**Settings → Services → + Add service → Roon**

| Field        | Enter                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| Host         | The Core's IP address                                                                  |
| Ports        | `9100` (default). Comma-separated if you want to probe more.                           |
| Ping count / Use ping | Defaults are fine                                                             |
| API port     | `9330` (default). Older Cores used `9100`; if zones never appear, try that.            |
| Use Roon API | Tick for zones and now playing; leave off for up/down only                             |

## 4. Check it works

After saving, the tile's dots turn green when the Core answers ping or the port probe. With the
Roon API on and the extension enabled, the stats show `paired: true`, the zone count and what is
playing.

## Troubleshooting

| Symptom                                      | Likely cause                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Watchman doesn't appear under Extensions     | **Use Roon API** is off, wrong API port, or the Core can't be reached on it. |
| `paired: false`, no zones                    | The extension isn't enabled yet in Roon.                                    |
| Service dot red, host dot green              | Nothing listens on the probed port. Check **Ports**.                        |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/roon|Roon integration]]
