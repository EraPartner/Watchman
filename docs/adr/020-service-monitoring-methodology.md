---
title: Service Monitoring Methodology Overhaul
type: adr
status: proposed
date: 2026-05-07
tags: [adr, monitoring, services, ping, snmp, tor, raspberry-pi, mac-mini, philips-hue, router, methodology]
description: Replace ad-hoc per-service probing with a uniform reachability baseline plus per-service deep-probes that prefer local, push-friendly, well-typed signals over external HTTP scrapes and brittle text parsers
aliases: [ADR-020, monitoring overhaul, probe methodology, reachability baseline]
---

# ADR-020: Service Monitoring Methodology Overhaul

> [!abstract] Summary
> Adopt a two-layer probe model for every service: (1) a uniform `ReachabilityProbe` (parallel ICMP + TCP) that runs on every health check and disambiguates "host down" from "service hung", and (2) a per-service deep probe that uses the most accurate locally-reachable signal — control ports over external scrapes, structured APIs over text parsing, vendor MIBs over generic ones, push channels over polling where free.

## Status

- **Status**: Proposed
- **Date**: 2026-05-07
- **Builds on**: [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] (BaseService contract), [[docs/adr/015-ui-driven-service-configuration|ADR-015]] (per-instance config schemas)

## Context

Watchman currently mixes nine distinct probe styles across fourteen service types. The result is uneven signal quality, brittle parsers, missing metrics on three services, and one service whose "health" depends entirely on a third-party HTTP API updated hourly.

### Audit summary

| Service | Health probe today | Stats probe today | Issue |
|---------|--------------------|--------------------|-------|
| Bitcoin | RPC `getblockchaininfo` | 4 RPC calls | No host-vs-service disambiguation; missing index/peer/fee metrics |
| IPFS | POST `/api/v0/version` | 5 API calls | No reachability baseline; missing bitswap/diag |
| qBittorrent | `/api/v2/app/version` | 4 API calls | No reachability baseline; no listen-port reachability check |
| AdGuard | `/control/status` | 2 API calls | No reachability baseline; missing client/DHCP visibility |
| AlbyHub | Scan 7 paths | Scan 11 paths | Path scanning every poll; no NWC integration → no Lightning metrics |
| Homebridge | Status + version | Status + version | No reachability baseline; missing accessories/cpu/ram |
| Synology | SNMP v3 (5 OIDs) | SNMP v3 (15 OIDs) | Missing RAID/Btrfs/disk-SMART/UPS OIDs (silent storage failures) |
| Tor | External Onionoo | External Onionoo | **Stale by up to 1 hour**; no local probe; can't see process death |
| Raspberry Pi | pigpio → ping fallback | pigpio + SSH-bounce-via-Mac-Mini → rpi-cli | Triple-hop, fragile, hard dependency on rpi-cli |
| Mac Mini | Ping | SSH `uptime`/`df`/`osx-cpu-temp` regex | Brittle text parsing; zero memory metrics |
| Router | Ping + TCP ports | Static config only | Zero stats |
| Roon | Ping + TCP | Static config only | Zero stats |
| Philips Hue | Ping | None | Zero stats; ignores unauthenticated `/api/0/config` |

### Cross-cutting gaps

1. **Reachability baseline missing on 8/14 services.** API-only probes cannot tell "host is down" from "service is wedged" — both look like timeouts. The router/Pi/Mac Mini/Hue services already do parallel ICMP+TCP; the pattern should be lifted.
2. **External dependency in critical path.** Tor health depends on `onionoo.torproject.org`; the ADR explicitly rejects this for production health.
3. **Text-parsing fragility.** Mac Mini parses `uptime`/`df`/`osx-cpu-temp` with regex. macOS format changes silently break stats.
4. **Indirect SSH paths.** Raspberry Pi data flows `Mac Mini → ssh → node → rpi-cli → pigpio-on-Pi`. Each hop adds latency, failure surface, and cross-machine config drift.
5. **Probe-per-poll discovery.** AlbyHub re-scans 7+ candidate paths on every poll instead of caching the resolved endpoint.
6. **Polling-only push targets.** Bitcoin (ZMQ), Hue v2 (SSE), Tor (control port async events) all expose push channels Watchman ignores.

## Decision

### Two-layer probe contract

Every service follows the same shape:

```
checkHealth():
  parallel:
    reachability = ReachabilityProbe(host, primaryPort)   // ICMP + TCP
    deep         = service-specific probe                  // protocol-native
  return:
    reachable   = deep.ok || (reachability.tcp && deep.degraded)
    latencyMs   = reachability.icmp.rttMs ?? deep.rttMs
    details     = { icmpAlive, tcpOpen, ...deepDetails }
```

`ReachabilityProbe` becomes a shared infra helper next to [[apps/backend/src/infra/net/pingProbe.ts|pingProbe.ts]] and [[apps/backend/src/infra/net/tcpProbe.ts|tcpProbe.ts]]. Existing per-service `ping` + `tcp` injection points are replaced with one `reachability: ReachabilityProber` dep.

### Per-service deep-probe upgrades

| Service | New probe | Replaces |
|---------|-----------|----------|
| **Tor** | TCP probe ORPort + Tor control-port (`9051`) `AUTHENTICATE` + `GETINFO status/circuit-established`, `status/version/current`, `traffic/read`, `traffic/written`. Optionally MetricsPort (`9035`) Prometheus parse. Keep Onionoo as slow background poll for consensus weight/flags only. | External Onionoo as primary signal |
| **Raspberry Pi** | Direct SSH to Pi reading `/sys/class/thermal/thermal_zone0/temp`, `/proc/loadavg`, `/proc/uptime`, `/proc/meminfo`, `vcgencmd measure_volts/get_throttled`. pigpio retained for hw-revision + GPIO state only. | Mac Mini SSH bounce + rpi-cli dependency |
| **Mac Mini** | `sysctl -n vm.loadavg`, `sysctl -n kern.boottime`, `vm_stat`, `system_profiler SPHardwareDataType -json`, `ioreg -r -n AppleSMC`. Memory metrics added. | Regex parse of `uptime`/`df`/`osx-cpu-temp` |
| **Router** | SNMP v2c (community-string, separate from Synology's v3 path) for `IF-MIB::ifInOctets`/`ifOutOctets`/`ifOperStatus`/`sysUpTime`. WAN throughput delta between polls. UPnP IGD where available. | Static config-only stats |
| **Synology** | Add private MIB OIDs: RAID status (`1.3.6.1.4.1.6574.3`), disk SMART (`1.3.6.1.4.1.6574.2`), UPS (`1.3.6.1.4.1.6574.4`), Btrfs scrub (`1.3.6.1.4.1.6574.101`). | SNMP v3 base OIDs only |
| **AlbyHub** | Cache resolved info-path on first success (per instance). When NWC token configured, query `/api/info` + `/api/node/info` for Lightning metrics. | Per-poll path scan; reachability-only stats |
| **Bitcoin** | Add `getindexinfo`, `getpeerinfo` (peer count + churn), `getblockstats <best>` (last-block size/fees), `estimatesmartfee`. Optional: ZMQ subscription on `tcp://node:28332` for push `hashblock`/`rawtx` notifications. | RPC-only, missing sync/peer/fee detail |
| **IPFS** | Add `/api/v0/stats/bitswap`, `/api/v0/diag/sys`. | Missing exchange/process metrics |
| **qBittorrent** | Add `/api/v2/torrents/trackers` per-tracker stats; verify listen-port via `connection_status` field already in payload. | No tracker visibility |
| **AdGuard** | Add `/control/clients` (active count), `/control/dhcp/status` (when DHCP enabled). | No client/DHCP visibility |
| **Homebridge** | Add `/api/accessories` count + `/api/status/cpu` + `/api/status/ram` if exposed. | No accessory/process metrics |
| **Roon** | Add HTTP GET `http://host:9330/display` liveness check. Keep TCP port probe. | TCP-only |
| **Philips Hue** | Unauthenticated `GET /api/0/config` for `bridgeid`/`modelid`/`swversion`. When app-key configured, `/api/<key>/lights` for reachable count. v2 SSE `/eventstream/clip/v2` is **out of scope** for this ADR — tracked as follow-up. | Ping-only, zero stats |

### Push channels — opt-in, not core

ZMQ (Bitcoin), SSE (Hue v2), control-port async events (Tor) are valuable but introduce long-lived sockets and event-bus plumbing. This ADR scopes them as **additive** later phases gated behind explicit per-instance config flags. The base poll loop remains the source of truth.

### What this ADR does NOT change

- Polling cadence model (`PollPolicy.healthMs` / `statsMs`) from [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]].
- Circuit breaker, in-process cache, scheduler.
- BaseService class shape: still `checkHealth()` + `getStats()` returning `Result<HealthSnapshot, DomainError>`.
- Frontend contract: `details` object passes through opaquely; new keys are additive.
- Number of services. No new service types added.

## Consequences

### Positive

- **Uniform "host vs service" signal.** ICMP+TCP baseline lets the dashboard show "host alive, service hung" instead of opaque timeouts.
- **Local probes for Tor.** Process death detected within one poll cycle (~10s) instead of up to one hour.
- **Pi simplification.** Drops dependency on rpi-cli, Node-on-Pi, pigpiod-required-for-stats, and the Mac Mini SSH bounce. One direct SSH connection.
- **macOS robustness.** `sysctl` returns parseable numeric values; `vm_stat` is stable; format changes are far less likely than `uptime` text format changes across macOS versions.
- **New stats unlock.** Router bandwidth, Hue bridge metadata, RAID degradation, Lightning balances — all currently invisible.
- **Fewer external dependencies in health path.** Onionoo demoted to slow-cadence background.

### Negative

- **More config surface.** Tor gains `controlPort`, `controlPassword`/`cookieAuthPath`. Pi gains direct SSH fields (already present, just newly required). Router gains SNMP fields. Each must be Zod-schemed and editable in the UI.
- **More infrastructure code.** New `infra/probe/ReachabilityProbe.ts`, `infra/tor/torControlClient.ts`, optionally `infra/snmp/snmpV2c.ts` (community-string mode). Estimated ~600 LOC + tests.
- **Migration effort.** Existing Pi setups configured to bounce through Mac Mini will need to enable direct SSH to the Pi instead. Migration documented in rollout plan.
- **Test cost.** Each service gets at least one new integration test per new probe. Mock SNMP/Tor-control fixtures expand the test corpus.

### Risks

- **Tor control-port auth complexity.** Cookie-auth requires file read on the Tor host; password-auth requires the operator to set `HashedControlPassword` in `torrc`. Failure mode must be a clean, actionable error, not a silent fallback to Onionoo.
- **Direct SSH to Pi may not be reachable** in setups where the Pi was deliberately NAT'd behind the Mac Mini. Schema must keep the bounce mode as a feature-flagged opt-in path during transition.
- **SNMP v2c on routers** is community-string auth in cleartext. Acceptable on a trusted home LAN per [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] threat model, but documented as such.
- **Push-channel scope creep.** ZMQ/SSE are tempting; constraining them to follow-up phases is a discipline, not a guarantee.

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Keep status quo and add ICMP only | Solves only one of the documented problems; leaves Tor stale, Pi triple-hopped, Mac Mini regex-fragile. |
| Replace polling with push everywhere (ZMQ, SSE, control-port events) | Massive bus-protocol surface; requires a new event router; breaks the simple poll-cycle mental model that [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] anchors on. |
| Move all metrics scraping to a Prometheus exporter sidecar (node_exporter on Pi/Mac, snmp_exporter for Synology/router) and have Watchman scrape one well-known format | Architecturally cleaner but pushes deployment complexity onto every host. Out of scope for a single-binary Electron app per [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]]. Could be a future ADR if the project ever moves back to a multi-host deploy. |
| Replace per-service classes with a generic "probe DSL" (YAML-described checks) | Loses static typing and Zod validation; reintroduces the brittleness this ADR is trying to fix. |
| Keep external Onionoo as Tor primary | The whole motivation for this ADR; rejected on accuracy grounds. |

## References

- Audit thread: this conversation, 2026-05-07.
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] — BaseService contract this ADR extends.
- [[docs/adr/015-ui-driven-service-configuration|ADR-015]] — config schema mechanism for new fields.
- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] — single-user LAN threat model that justifies SNMP v2c.
- [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]] — deployment model new probes must respect.
- Rollout plan: [[docs/architecture/service-monitoring-rollout-plan|Service Monitoring Rollout Plan]].
- Code: `[[apps/backend/src/domain/BaseService.ts]]`, `[[apps/backend/src/infra/net/pingProbe.ts]]`, `[[apps/backend/src/infra/net/tcpProbe.ts]]`, `[[apps/backend/src/infra/snmp/snmpGetterImpl.ts]]`, `[[apps/backend/src/domain/services/tor/TorService.ts]]`, `[[apps/backend/src/domain/services/raspberryPi/PiStatsCollector.ts]]`, `[[apps/backend/src/domain/services/macMini/MacMiniService.ts]]`.
