---
title: Set up a Tor relay
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, tor, onionoo, controlport, credentials]
description: Monitor a Tor relay through public Onionoo data or its ControlPort, and add it to Watchman
aliases: [tor setup, set up tor relay, tor controlport]
---

# Set up a Tor relay

> [!abstract] What Watchman reads
> - **Onionoo mode (default):** public relay data from `onionoo.torproject.org/details?search=…`:
>   running flag, bandwidth, consensus weight, country, AS. No access to the relay itself.
> - **ControlPort mode:** ICMP ping plus a Tor control connection that only sends `AUTHENTICATE`,
>   `GETINFO` (traffic, version, circuits, accounting) and `SETEVENTS BW` for live bandwidth.
>   When the ControlPort can't be reached, Watchman falls back to Onionoo by itself.
>
> (`apps/backend/src/domain/services/tor/TorService.ts`, `apps/backend/src/infra/tor/`). Details:
> [[docs/integrations/tor|Tor integration]].

## Pick a mode

| Use                 | When                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| **Onionoo**         | Simplest and fully read-only. Data lags by about an hour. Works from anywhere. |
| **ControlPort**     | Live traffic numbers. Needs access to the relay's control port, which has no read-only mode. |

## 1. Onionoo mode

Nothing to set up on the relay. You need its **nickname** or, better, its 40-character
**fingerprint** (in the relay's `fingerprint` file or on metrics.torproject.org). Watchman only
accepts an exact nickname or fingerprint match; a fingerprint can't collide with another relay's
nickname.

Watchman makes these requests from its own IP to the Onionoo service run by the Tor Project. In
ControlPort mode it still asks Onionoo about once an hour for country and AS details, and uses it as
the fallback.

## 2. ControlPort mode

The Tor control protocol has no read-only role: whoever authenticates can reconfigure or stop the
relay. Watchman only sends the commands listed above. Keep the port as closed as possible.

**Watchman on the relay machine (recommended).** In `torrc`:

```text
ControlPort 127.0.0.1:9051
CookieAuthentication 1
CookieAuthFileGroupReadable 1
```

Add the user that runs Watchman to the group that owns the cookie (`debian-tor` on Debian/Ubuntu),
restart Tor, and point Watchman at the cookie file (usually `/var/lib/tor/control_auth_cookie`
or `/run/tor/control.authcookie`). Nothing secret is stored in Watchman.

**Watchman on another machine.** The cookie file must be readable on the Watchman machine, so use a
password instead:

```bash
tor --hash-password 'a-long-random-password'
```

```text
ControlPort 192.168.1.50:9051
HashedControlPassword 16:…
```

Firewall 9051 to the Watchman host only. The control protocol is unencrypted, so the password crosses
your LAN in clear text; keep it on a trusted network.

> [!warning] Unverified
> The `torrc` options are from the Tor manual and weren't tested with Watchman against a live relay.

## 3. Add it in Watchman

**Settings → Services → + Add service → Tor Relay**

| Field                         | Enter                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Relay nickname                | Nickname or fingerprint. Needed in both modes (it's also the fallback).       |
| Onionoo URL                   | Default `https://onionoo.torproject.org`                                      |
| Use ControlPort (local relay) | Off for Onionoo mode, on for ControlPort mode                                 |
| Relay host                    | ControlPort mode: the relay's IP (`127.0.0.1` when on the same machine)        |
| ControlPort                   | `9051` unless changed                                                         |
| ControlPort password          | Only for password auth                                                        |
| Cookie auth file              | Only for cookie auth, the path on the Watchman machine. Wins over the password when set. |
| ICMP probe count              | Default 1                                                                     |

## 4. Check it works

After saving, the tile shows the relay's running state and bandwidth. In ControlPort mode the stats
show `source: control-port`; `source: onionoo` means Watchman fell back because the control port
didn't answer.

## Troubleshooting

| Symptom                                      | Likely cause                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `tor relay "…" not found`                    | Nickname typo, or a brand-new relay not yet in Onionoo (allow a few hours).    |
| Numbers belong to a different relay          | Another relay uses the same nickname. Enter the fingerprint instead.          |
| `tor control auth failed: …`                 | Wrong password, or the cookie file is unreadable or from a different Tor instance. |
| Always `source: onionoo` in ControlPort mode | Tor listens on 127.0.0.1 only, wrong host or port, or a firewall blocks 9051. |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/tor|Tor integration]]
