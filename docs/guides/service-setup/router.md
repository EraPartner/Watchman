---
title: Set up a router
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, router, snmp, snmp-v2c, read-only]
description: Add a router to Watchman with ping and port checks, and optionally a read-only SNMP community
aliases: [router setup, set up router, router snmp]
---

# Set up a router

> [!abstract] What Watchman reads
> ICMP ping and, if you list ports, a TCP connect to them. With SNMP (v3, or a v2c community) it
> also walks a few read-only subtrees: uptime, interface names, byte counters, link state
> (`ifAdminStatus`/`ifOperStatus`) and error counters, the ARP table (client count) and CPU load
> (`apps/backend/src/domain/services/router/RouterService.ts`). Details:
> [[docs/integrations/router|Router integration]].

## 1. Prepare the router

Nothing is needed for ping. If the router drops ping from the LAN, add a port it always listens on
(for example `80` or `443` for its web interface) so the service dot has something to check.

## 2. Create read-only SNMP access (optional, for traffic, link and CPU stats)

**Prefer SNMPv3** if the router offers it: create a read-only v3 user with **authPriv**
(authentication **SHA**, privacy **AES**). Nothing then crosses the network in clear text. Watchman
uses v3 whenever the v3 user and both keys are filled in, and ignores the community.

Otherwise use SNMP **v2c** with a **read-only** community. Never a read-write one.

- Pick a random community string; don't use `public`. v2c sends it unencrypted, so keep SNMP on the
  LAN side only.
- Allow it only from the Watchman machine's IP if the router supports a source restriction.
- If the router lets you limit what the community can see, these subtrees are all Watchman reads:

| Subtree                    | Used for                         |
| -------------------------- | -------------------------------- |
| `1.3.6.1.2.1.1`            | System uptime                    |
| `1.3.6.1.2.1.2.2.1`        | Interface names, link state, error and 32-bit byte counters |
| `1.3.6.1.2.1.31.1.1.1`     | 64-bit interface counters        |
| `1.3.6.1.2.1.4.22.1`       | ARP table (client count)         |
| `1.3.6.1.2.1.25.3.3.1`     | CPU load                         |

On routers that use net-snmp's `snmpd.conf` (OpenWrt and many Linux-based routers), that looks like:

```text
view   watchman included .1.3.6.1.2.1.1
view   watchman included .1.3.6.1.2.1.2.2.1
view   watchman included .1.3.6.1.2.1.31.1.1.1
view   watchman included .1.3.6.1.2.1.4.22.1
view   watchman included .1.3.6.1.2.1.25.3.3.1
rocommunity YOUR-RANDOM-COMMUNITY 192.168.1.10 -V watchman
```

For SNMPv3 instead of the `rocommunity` line (net-snmp; create the user with
`net-snmp-create-v3-user` or a `createUser` line while `snmpd` is stopped):

```text
createUser watchman SHA "auth-passphrase" AES "priv-passphrase"
rouser watchman priv -V watchman
```

> [!warning] Unverified
> The `snmpd.conf` lines follow net-snmp's documented syntax and were not tested on a router.
> Consumer router web interfaces usually only offer "SNMP on/off" and a community; that's fine.

## 3. Add it in Watchman

**Settings → Services → + Add service → Router**

| Field            | Enter                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Host             | The router's LAN IP, e.g. `192.168.1.1`                                               |
| Ports            | Optional, comma-separated, e.g. `80, 443`. Empty = ping only.                         |
| Ping count       | Default 1                                                                             |
| SNMP community   | The read-only v2c community from step 2, or empty                                     |
| SNMPv3 user / auth key / priv key | The v3 user and its two passphrases from step 2 (used instead of the community when all three are set) |
| SNMPv3 auth / priv protocol | `SHA` / `AES` (MD5/DES only for old devices)                               |
| Interface filter | Optional, comma-separated interface names to count, e.g. just your WAN port. Empty = every interface except loopback, which counts routed traffic twice (once in, once out). |

Add one router service per router; give each its own instance id (for example `main`, `ap-upstairs`).

## 4. Check it works

After saving, the tile shows up when the router answers ping or any listed port. With SNMP, stats
show uptime, connected clients, CPU load, traffic rates (from the second poll on), links that are
configured up but down (the tile turns amber) and the total interface error count.

## Troubleshooting

| Symptom                                   | Likely cause                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| No SNMP numbers at all                    | SNMP off, wrong community, source restriction excludes Watchman, or UDP 161 blocked. SNMP failures don't turn the tile red. |
| Only some SNMP numbers                    | The router doesn't implement that MIB (e.g. no CPU load) or your view leaves it out. Each walk degrades on its own. |
| Traffic totals look too small             | The interface filter names don't match the router's `ifDescr` names.         |
| Traffic about double what you expect      | No interface filter: routed traffic is counted on the inbound and outbound port. Set the filter to your WAN interface. |
| Tile amber, "Links down: 1"               | A port that is enabled on the router has no link. Ports switched off on purpose are not counted. |
| SNMPv3 gives no numbers                   | Wrong user, passphrases or protocols, or the user isn't `authPriv`.          |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/router|Router integration]]
