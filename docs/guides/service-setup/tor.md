---
title: Set up a Tor relay
type: guide
status: active
date: 2026-11-05
tags: [guide, setup, services, tor, onionoo, controlport, credentials]
description: Monitor a Tor relay through public Onionoo data or its ControlPort, and add it to Watchman
aliases: [tor setup, set up tor relay, tor controlport]
---

# Set up a Tor relay

> [!abstract] What Watchman reads
> - **Onionoo mode (default):** public relay data from `onionoo.torproject.org/details?search=…`:
>   running flag, bandwidth, consensus weight, country, AS. No access to the relay itself.
> - **ControlPort mode:** ICMP ping plus a Tor control connection that only sends `AUTHENTICATE`,
>   `GETINFO` (traffic, version, circuits, accounting, bootstrap, reachability self-test, uptime)
>   and `SETEVENTS BW WARN ERR` for live bandwidth and Tor's own warnings.
> - **MetricsPort (optional, both modes):** a `GET` of Tor's Prometheus endpoint for the relay
>   overload counters (`tor_relay_load_*`).
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

**Enforce read-only with a filter proxy (optional).** Because Tor has no read-only control role,
the only way to make the connection itself read-only is a filter in front of it. Whonix's
**onion-grater** denies every command by default and passes only whitelisted commands, arguments
and events (profiles are YAML files in `/etc/onion-grater-merger.d/`); anything else gets
`510 Command filtered`. A profile for Watchman would allow `GETINFO` with the keys listed on the
[[docs/integrations/tor|integration page]] and `SETEVENTS BW WARN ERR`, and nothing else. Point
Watchman's ControlPort at onion-grater's port instead of Tor's.

> [!warning] Unverified
> The `torrc` options are from the Tor manual and weren't tested with Watchman against a live relay.
> onion-grater's behaviour is from whonix.org/wiki/Dev/onion-grater; no Watchman profile has been
> tested.

## 2b. MetricsPort (optional)

Tor can serve its own counters over HTTP in Prometheus format. It only reports numbers and accepts
no commands. In `torrc`:

```text
MetricsPort 127.0.0.1:9035
MetricsPortPolicy accept 127.0.0.1
```

`MetricsPortPolicy` rejects everything by default, so list the Watchman host. The Tor Project warns
that exposing the metrics publicly is dangerous for Tor users: keep it on localhost or a firewalled
LAN address. Then set **MetricsPort URL** in Watchman to `http://127.0.0.1:9035/metrics`.

> [!warning] Unverified
> Watchman reads every `tor_relay_load_*` counter it finds, summed over labels. The exact names
> depend on the Tor version and weren't checked against a live relay.

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
| MetricsPort URL               | Optional, see 2b                                                              |

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
| `metricsPortError: MetricsPort returned 403` | `MetricsPortPolicy` doesn't accept the Watchman host.                         |
| ORPort reachable: false                      | Tor's self-test can't reach your ORPort from outside: check port forwarding.   |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/tor|Tor integration]]
