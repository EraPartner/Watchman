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
> ICMP ping and, if you list ports, a TCP connect to them. With an SNMP community it also walks a
> few read-only SNMP v2c subtrees: uptime, interface names and byte counters, the ARP table (client
> count) and CPU load (`apps/backend/src/domain/services/router/RouterService.ts`). Details:
> [[docs/integrations/router|Router integration]].

## 1. Prepare the router

Nothing is needed for ping. If the router drops ping from the LAN, add a port it always listens on
(for example `80` or `443` for its web interface) so the service dot has something to check.

## 2. Create a read-only SNMP community (optional, for traffic and CPU stats)

Watchman uses SNMP **v2c** for routers. Enable the router's SNMP agent with a **read-only**
community. Never a read-write one.

- Pick a random community string; don't use `public`. v2c sends it unencrypted, so keep SNMP on the
  LAN side only.
- Allow it only from the Watchman machine's IP if the router supports a source restriction.
- If the router lets you limit what the community can see, these subtrees are all Watchman reads:

| Subtree                    | Used for                         |
| -------------------------- | -------------------------------- |
| `1.3.6.1.2.1.1`            | System uptime                    |
| `1.3.6.1.2.1.2.2.1`        | Interface names, 32-bit counters |
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
| SNMP community   | The read-only community from step 2, or empty for no SNMP                             |
| Interface filter | Optional, comma-separated interface names (e.g. `eth0, wlan0`) to count; empty = all  |

Add one router service per router; give each its own instance id (for example `main`, `ap-upstairs`).

## 4. Check it works

After saving, the tile shows up when the router answers ping or any listed port. With SNMP, stats
show uptime, connected clients, CPU load and traffic rates (rates appear from the second poll on).

## Troubleshooting

| Symptom                                   | Likely cause                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| No SNMP numbers at all                    | SNMP off, wrong community, source restriction excludes Watchman, or UDP 161 blocked. SNMP failures don't turn the tile red. |
| Only some SNMP numbers                    | The router doesn't implement that MIB (e.g. no CPU load) or your view leaves it out. Each walk degrades on its own. |
| Traffic totals look too small             | The interface filter names don't match the router's `ifDescr` names.         |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/router|Router integration]]
