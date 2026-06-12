---
title: "Session: Per-Service Telemetry Optimization"
type: review
status: complete
date: 2026-06-12
tags: [session, review, telemetry, polling, sse, ssh, rpc, caching]
description: Session note for the telemetry-method review and optimization pass across all 13 service integrations — fewer requests per poll cycle, richer data where the native APIs offered more
aliases: [telemetry optimization session]
---

# Session: Per-Service Telemetry Optimization (2026-06-12)

> [!abstract] Summary
> Reviewed every service integration's collection method against its native API surface, then implemented all improvements: waste removal (batched/deduplicated/memoized requests), data expansion (Homebridge, Hue, AlbyHub, Tor, Synology, IPFS, Bitcoin, AdGuard, Roon), and a push channel for Hue (SSE eventstream). All gates green: backend 560 tests / frontend 433 tests, typecheck (3 workspaces), lint 0 errors, full build.

## New shared infrastructure

- [[apps/backend/src/core/ttlMemo.ts|core/ttlMemo.ts]] — TTL memo for configuration-grade data with shared in-flight fetch and stale-on-error; used by qBittorrent, IPFS, AdGuard, Homebridge, Hue.
- [[apps/backend/src/infra/ssh/compound.ts|infra/ssh/compound.ts]] — delimiter-joined compound SSH exec (one round-trip per cycle); used by Mac Mini and Raspberry Pi.
- [[apps/backend/src/infra/http/sseClient.ts|infra/http/sseClient.ts]] — minimal Server-Sent-Events consumer with auto-reconnect; supports the cert-pinned dispatcher (`createPinnedDispatcher`).

## Waste removed (same data, cheaper)

| Service      | Before → After                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bitcoin      | 8 HTTP round-trips → 1 batched JSON-RPC request; heavy `getpeerinfo` dropped (peer count from `getnetworkinfo`)                                          |
| qBittorrent  | redundant `transfer/info` dropped (maindata `server_state` already carries it); version/preferences hourly memo — steady state is 2 incremental requests |
| IPFS         | POST-only (no more GET→405→POST double requests); `pin/ls` (quiet) + `stats/dht` on a 10-min slow lane                                                   |
| AdGuard      | 7 config-grade endpoints on a 10-min slow lane (per-poll: status + stats only)                                                                           |
| Mac Mini     | 8 SSH execs → 1 compound exec                                                                                                                            |
| Raspberry Pi | 9 SSH execs → 1 compound exec; cpuinfo/os-release cached per service lifetime                                                                            |
| Tor          | (enrichment already cached 1h) flags/weight/country now from the local node instead of Onionoo                                                           |
| Hue          | light list not refetched while the SSE eventstream is healthy                                                                                            |

## Data added

- **Homebridge**: status, CPU load/temp, RAM, host/process uptime, child-bridge counts, plugin count + updates available, accessory count, latest version + updateAvailable.
- **Philips Hue**: zigbee unreachable count, low-battery count + min battery %, device/room counts, SSE liveness (`sseConnected`, `lastEventAt`) — plus real-time light state via `/eventstream/clip/v2`.
- **AlbyHub**: lightning/on-chain balances, channel count/active/local/remote balances (token-gated).
- **Bitcoin**: fee estimates (sat/vB for 1/6/144 blocks); ZMQ endpoint sanity check via `getzmqnotifications`.
- **Tor**: OR-connection and circuit counts, own consensus flags + weight, GeoIP country — from the ControlPort.
- **Synology**: DSM utilization (CPU/mem/net), multi-volume disk totals, DSM-only stats mode (SNMPv3 optional for stats).
- **IPFS**: bitswap exchange metrics (blocks/data sent+received, dup blocks, wantlist).
- **AdGuard**: top upstream + average upstream response time.
- **Roon**: per-zone detail array.
- **Mac Mini**: Apple-Silicon-compatible temperature via `smctemp`.

## Config field changes

- `ipfs.forcePost` removed (RPC is always POST).
- `router.snmpVersion` removed (was never implemented; v2c only).

## Renderer updates

Detail groups added for Homebridge (Bridge/Host), Hue (Zigbee & devices), AlbyHub (Wallet, msat→sats), Bitcoin (Fees). Homebridge tone now warns on `status != up` or down child bridges.

## Follow-ups (not implemented)

- Router: ubus/rpcd telemetry for OpenWrt-based devices (richer wireless client data than generic SNMP) — left as an option.
- Hue SSE currently freshens the service's in-memory state between polls; pushing SSE-driven updates straight onto the event bus (true sub-poll dashboard latency) would need a service→bus plumbing decision.
- DSM utilization network counters (`dsmNetRx`/`dsmNetTx`) are surfaced raw — units as reported by DSM; verify against a real NAS before charting them.

## Related

- [[docs/reviews/2026-06-12-audit-remediation-session|Audit remediation session (same day)]]
- [[docs/performance/caching-strategies|Caching Strategies]]
