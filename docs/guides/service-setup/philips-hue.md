---
title: Set up a Philips Hue Bridge
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, philips-hue, hue-api-v2, pairing, cert-pinning]
description: Pair Watchman with a Philips Hue Bridge and add it with a pinned certificate
aliases: [hue setup, set up philips hue, hue pairing]
---

# Set up a Philips Hue Bridge

> [!abstract] What Watchman reads
> ICMP ping, plus Hue API v2 (`/clip/v2/resource/bridge` for health, `light`, `zigbee_connectivity`, `device_power`,
> `device`, `room`) and the `/eventstream/clip/v2` event stream for live light state, all over HTTPS
> pinned to the bridge's own certificate
> (`apps/backend/src/domain/services/philipsBridge/PhilipsBridgeService.ts`). It never switches
> lights. Details: [[docs/integrations/philips-hue|Philips Hue integration]].

## 1. Prepare the bridge

- Give the bridge a fixed IP address (a DHCP reservation on your router), so the saved host doesn't
  go stale.
- Light stats need Hue API v2, which the square **Hue Bridge (v2)** provides. With the older round
  bridge only the ping check works.
- The Watchman machine must reach the bridge on TCP 443.

## 2. Credentials: pair once

Hue has no read-only keys: an application key can read and control everything on the bridge.
Watchman uses it only for `GET` requests. Pairing is the one write Watchman makes, once, to create
the key (allowed as a one-time setup step).

Pair from the form:

1. In **Settings → Services → + Add service → Philips Hue Bridge**, type the bridge's IP in **Host**.
2. Press the round **link button** on top of the bridge.
3. Within 30 seconds, click **Pair with bridge** in the form.
4. On success the form fills **Application key** and **Cert SHA-256** and says
   "Paired. Save to keep the key." Click **Save**. If you close the form without saving, the key is
   lost and you have to pair again.

The cert hash pins the bridge's self-signed certificate. Without it Watchman can't make HTTPS calls
to the bridge (normal certificate checks always fail on it), so light stats need both fields.

If pairing from the form doesn't work, the [[docs/integrations/philips-hue#Manual Alternative|manual curl
method]] gets the same two values.

## 3. Other fields

| Field         | Enter                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| Host          | The bridge's IP address                                                 |
| Ping count    | Default 2                                                               |
| Use ping      | On, unless your network blocks ping to the bridge                       |

## 4. Check it works

After saving, the tile's host and service dots turn green, and the tile shows how many lights are on and
off, plus Zigbee connectivity, battery and room counts.

## Troubleshooting

| Symptom                                           | Likely cause                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| "link button not pressed — press the physical button…" | More than 30 s passed, or the button wasn't pressed. Press it and click again right away. |
| "Enter the bridge host first"                     | The Host field is empty.                                                  |
| Pairing times out / bridge unreachable            | Wrong IP, or port 443 is blocked between Watchman and the bridge.         |
| Host up, no light stats                           | Application key or cert hash missing, or an old round bridge.             |
| `hue application key rejected — re-pair the bridge` | The key was removed (e.g. factory reset). Pair again and save.          |
| Light stats stopped later, TLS error             | The bridge's certificate changed so the pin no longer matches. Pair again and save. |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/philips-hue|Philips Hue integration]]
