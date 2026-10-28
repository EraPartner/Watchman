---
title: Service Setup Guides
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, configuration, credentials, least-privilege, read-only]
description: How to prepare each monitored service, create least-privilege read-only credentials, and add the service in Watchman
aliases: [service setup, configuring services, service configuration guides, setup guides]
---

# Service Setup Guides

> [!abstract] Overview
> One guide per supported service. Each one says what to turn on in the service, which account or
> token to create (read-only where the service allows it), what to type into Watchman, and how to
> check that it works. Watchman only reads from monitored services ([[docs/adr/032-monitoring-only-no-service-control|ADR-032]]).
> The developer-level detail for each service (endpoints, metrics, internals) stays on its
> [[docs/integrations/index|integration page]].

## Pick a service

| Service                                                   | How Watchman reads it                          | What you create on the service                         | Read-only possible?                     |
| --------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| [[docs/guides/service-setup/adguard\|AdGuard Home]]        | HTTP API, Basic auth                           | A dedicated web user                                   | No (every user is an admin)             |
| [[docs/guides/service-setup/albyhub\|Alby Hub]]            | HTTP API, Bearer JWT                           | A `readonly` token from `/api/unlock`                  | Yes                                     |
| [[docs/guides/service-setup/bitcoin\|Bitcoin Core]]        | JSON-RPC (+ optional ZMQ)                      | An `rpcauth` user with an `rpcwhitelist`               | Yes (method whitelist)                  |
| [[docs/guides/service-setup/homebridge\|Homebridge]]       | Config UI X HTTP API, JWT                      | A Config UI X user                                     | Partly (non-admin user; see guide)      |
| [[docs/guides/service-setup/ipfs\|IPFS (Kubo)]]            | Kubo RPC API, no auth                          | Nothing; limit where the API listens                   | No (network isolation only)             |
| [[docs/guides/service-setup/macmini\|Mac Mini]]            | ICMP ping + SSH commands                       | A standard (non-admin) macOS user with an SSH key      | Yes (non-admin user, restricted key)    |
| [[docs/guides/service-setup/philips-hue\|Philips Hue]]     | Hue API v2 (HTTPS, pinned cert)                | An application key (one-time pairing)                  | No (Hue keys have full access)          |
| [[docs/guides/service-setup/qbittorrent\|qBittorrent]]     | Web UI API, cookie login                       | The Web UI user                                        | No (single Web UI account)              |
| [[docs/guides/service-setup/raspberry-pi\|Raspberry Pi]]   | ICMP ping + pigpiod socket + SSH commands      | A non-sudo user with an SSH key                        | SSH yes; pigpiod no (restrict by IP)    |
| [[docs/guides/service-setup/roon\|Roon]]                   | ICMP/TCP probes, optional Roon extension API   | Approve the "Watchman" extension (one-time)            | No (Roon has no read-only extension)    |
| [[docs/guides/service-setup/router\|Router]]               | ICMP ping, TCP probes, optional SNMP v2c       | A read-only SNMP community                             | Yes (read-only community)               |
| [[docs/guides/service-setup/synology\|Synology NAS]]       | SNMP v3, optional DSM Web API                  | An SNMPv3 user; optionally a DSM account               | SNMP yes; DSM see guide                 |
| [[docs/guides/service-setup/tor\|Tor relay]]               | Onionoo (public) or local ControlPort          | Nothing (Onionoo) or ControlPort auth                  | Onionoo yes; ControlPort no             |

"Read-only possible?" is about the credential the service lets you create. Watchman itself only
sends read requests in every case; the column tells you how much damage a leaked credential could do.

## Adding a service in Watchman

You can add a service in three places. All three use the same form, built from the field list in
`apps/backend/src/config/schemas/fieldMetadata.ts`.

- **First run:** the setup wizard (`/setup`) opens when no services are configured. Pick a service
  card, fill in the form, save, and repeat.
- **Settings:** **Settings → Services → + Add service**.
- **Dashboard:** **+ Add service** in the top bar.

Every form has these common fields:

| Field         | What to enter                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Kind          | The service type. It can't be changed after saving.                                                                           |
| Instance id   | A short name, unique within the kind. Lowercase letters, digits and dashes, up to 64 characters. Default `main`. Use `nas-2` etc. for more than one of the same kind. |
| Enabled       | Untick to keep the settings but stop polling.                                                                                 |
| Advanced      | Cache TTL (default 10 000 ms) and timeout (default 5 000 ms). Raise the timeout for slow links (VPN, Tor, Wi-Fi bridges).      |

Then:

1. Fill in the service fields as the service's guide describes. Fields marked `*` are required.
2. Click **Save**. Validation errors show as `field: problem`.
3. The tile appears on the dashboard a moment after saving. Services with a host and a service
   check show two status dots: the first is the host (ping), the second the service itself. The
   service dot is the one that counts. Services with one check show one dot. Stats fill in on the
   first stats cycle (30 s by default).
4. Optionally open the service again (**Settings → Services → Edit**) and click **Test connection**
   to run one health check now. The button only works on a saved, enabled service.

> [!warning] Known issue: Test connection can say OK for a down service
> For most services the health check reports an unreachable service as a successful check with
> `reachable: false` (`withHostPing` in `apps/backend/src/domain/health.ts`), and the editor only
> shows `Failed: …` for a check that errors. So `OK (… ms)` means "the check ran", not "the service
> is up". Trust the tile's status dot until this is fixed.

Secret fields (passwords, tokens, keys) are encrypted at rest with the server master key (see
[[docs/reference/environment-variables|Environment Variables]], `WATCHMAN_MASTER_KEY`) and are never
sent back to the browser. When you edit a saved service, a secret field shows
"(saved — leave blank to keep)": leave it blank to keep the stored value.

You can also create services through the API (`POST /config/services`, see
[[docs/api/config|Config API]]); the UI is the supported path.

## Things every service needs

- **Network reach from the Watchman machine.** Watchman connects from wherever the backend runs
  (your Mac for the desktop app, the server for a server install). File paths such as SSH keys and the
  Tor cookie file are also read on that machine. `~/` is expanded.
- **ICMP ping.** Most services also ping the host for the "host" indicator. Watchman runs the
  system `ping` binary (`apps/backend/src/infra/net/pingProbe.ts`). A firewall that drops ping
  (for example macOS "stealth mode") makes the host indicator red. For most services the service
  probe, not the ping, decides whether the tile is up ([[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]]).
  Mac Mini health is ping-only, so there it matters.
- **Plain HTTP on a trusted network.** Several services (Bitcoin RPC, IPFS, qBittorrent, AdGuard on
  `http://`) send credentials unencrypted. Keep these on your LAN or a VPN, never on the internet.

## Least-privilege checklist

1. Create a separate account or token for Watchman, so you can revoke it without touching anything else.
2. Use the narrowest permission the service offers (see the table above).
3. Limit where the service accepts it from: bind to the LAN interface, allow only the Watchman host's
   IP where the service supports it.
4. Don't reuse your admin password. If the service only has one admin account (qBittorrent,
   AdGuard Home), use a long unique password and keep the service off the internet.

## Related

- [[docs/integrations/index|Service Integrations]]: developer reference per service
- [[docs/guides/adding-services|Adding Services]]: how to add a new service *kind* to the code
- [[docs/guides/running-the-desktop-app|Desktop App]]
- [[docs/troubleshooting|Troubleshooting]]
- [[docs/guides/index|Guides]]
