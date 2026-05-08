---
title: Two-Tier Health Model + Per-Service Monitoring Upgrades
type: adr
status: proposed
date: 2026-05-07
tags: [adr, monitoring, health, snmp, ssh, tor, hue, ping, observability]
description: Adopt a universal ICMP layer alongside protocol probes (two-tier health), and upgrade each service's monitoring methodology to surface richer, more accurate data than the current implementations expose
aliases: [ADR-019, two-tier health, monitoring upgrades, ping layer]
---

# ADR-019: Two-Tier Health Model + Per-Service Monitoring Upgrades

> [!abstract] Summary
> Make ICMP reachability a universal first-class signal in `BaseService` (host tier), keep protocol-specific probes as the second tier (service tier), and upgrade each service's polling methodology to use the richest API surface the underlying daemon actually exposes — replacing third-party APIs and TCP-only probes with native control protocols where they exist (Tor ControlPort, Hue API v2, SNMP for routers, DSM API + extended SNMP for Synology, Roon WebSocket API, ZMQ for Bitcoin, Homebridge Config UI X API).

## Status

- **Status**: Proposed (Phase 0a **COMPLETED** 2026-05-07, Phase 0b **COMPLETED** 2026-05-07, Phase 0c **COMPLETED** 2026-05-07, Task B3 **COMPLETED** 2026-05-07, Task B4 **COMPLETED** 2026-05-07, Task B5 **COMPLETED** 2026-05-07, Task B6 **COMPLETED** 2026-05-07, Task B7 **COMPLETED** 2026-05-07)
- **Date**: 2026-05-07
- **Phase 0a**: ✅ DONE — Two-tier health in `BaseService` with `withHostPing` helper wired to all 13 services. See [[docs/guides/monitoring-upgrade-plan|Monitoring Upgrade Plan § Phase 0a]].
- **Phase 0b (Tor ControlPort)**: ✅ DONE — Tor ControlPort client built (`infra/tor/controlClient.ts` with TCP socket wrapper, async line-buffered reader, Tor control protocol parser). TorService wired to ControlPort path with fallback to Onionoo. All service unit tests updated to Phase 0b pattern: `ping: PingProber` required, `checkHealth` always returns `ok(HealthSnapshot)`, 226 tests passing. See [[docs/testing/testing-strategy.md|Testing Strategy § Service Class Testing (Phase 0b)]].
- **Task B3 (Tor Cookie Auth)**: ✅ DONE 2026-05-07 — Cookie auth support added to `controlClient.ts` with priority-based auth dispatch (cookie > password > empty). Config field `cookieAuthFile` added to `TorInstance` schema. Three new unit tests cover cookie hex encoding, successful auth, and 515 auth failure. Aligns with secure Tor deployments using `--enable-control-socket-is-world-writable=no`.
- **Task B4 (Tor GETCONF + SIGNAL)**: ✅ DONE 2026-05-07 — `TorControlHandle` interface expanded with `getconf(keys, signal): Promise<Map<string,string>>` and `signal(name, signal): Promise<void>` methods for configuration queries and control signal operations. Implemented in `TorControlHandleImpl` class.
- **Task B5 (Tor Event Subscription)**: ✅ DONE 2026-05-07 — Event subscription infrastructure (`infra/tor/eventSubscription.ts`) with persistent TCP socket, async event routing (`650` prefix), FIFO reply-waiter queue, handler registry, and graceful shutdown (`closing`/`closed` flags). `TorService` now runs `onStart()` / `onStop()` lifecycle, creates event subscription for `BW` events, maintains realtime `bwRead`/`bwWritten` metrics. `registerServices.ts` passes `createTorEventSubscriptionFactory()` to Tor service. See [[docs/integrations/tor|Tor Integration]] and [[docs/testing/testing-strategy.md|Testing Strategy § Task B5 Addition]].
- **Task B6 (Tor Traffic Deltas)**: ✅ DONE 2026-05-07 — Traffic delta tracking for network activity monitoring. Private fields `lastTrafficRead` and `lastTrafficWritten` added to `TorService`, initialized to -1 as "no baseline" sentinel. `getStatsControlPort()` computes delta metrics: `trafficDeltaRead = traffic/read[current] - traffic/read[previous]` (bytes sent to wire), `trafficDeltaWritten` similarly (bytes received from wire). First poll returns 0 for both deltas. State updated after each successful poll. New metrics exposed in stats output: `trafficDeltaRead`, `trafficDeltaWritten` (both integers, bytes). Enables time-series charts of per-poll network activity without storing full historical counters. See [[docs/integrations/tor|Tor Integration § Traffic Deltas (Task B6)]].
- **Task B7 (Tor Onionoo Supplemental Enrichment)**: ✅ DONE 2026-05-07 — ControlPort path is now primary; Onionoo is supplemental for geolocation and consensus weight. `OnionooRelay` interface enhanced with `as_name?: string` and `consensus_weight_fraction?: number` fields. Private `enrich(signal)` method added: asynchronously calls `searchRelay()` to fetch Onionoo relay data, returns best-effort subset `{country?, consensusWeight?, asName?, consensusWeightFraction?}`, swallows errors silently (non-fatal). `getStatsControlPort()` calls `enrich()` and conditionally spreads the 4 enrichment fields into metrics — fields only present when Onionoo successfully returns them. Enrichment does not block ControlPort metrics. Onionoo-only path (when `useControlPort=false`) unchanged. See [[docs/integrations/tor|Tor Integration § Onionoo Supplemental Enrichment (Task B7)]].
- **Extends**: [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] (poll loop in `BackgroundPoller`), [[docs/adr/018-split-deploy-pi-backend|ADR-018]] (always-on Pi backend means we can afford richer probes)
## Task B6 — Tor Traffic Deltas (COMPLETED 2026-05-07)

To surface per-poll network activity without maintaining full historical counters, the ControlPort path now tracks cumulative traffic and computes deltas.

**Implementation** (`domain/services/tor/TorService.ts`):

```typescript
private lastTrafficRead = -1;      // Cumulative bytes read at last poll; -1 = no baseline
private lastTrafficWritten = -1;   // Cumulative bytes written at last poll

async getStatsControlPort(signal: AbortSignal): Promise<StatsResult> {
  // ... connect and fetch traffic/read, traffic/written ...
  const trafficRead = parseIntMetric(coreInfo.get('traffic/read'));
  const trafficWritten = parseIntMetric(coreInfo.get('traffic/written'));
  const trafficDeltaRead = this.lastTrafficRead >= 0 ? trafficRead - this.lastTrafficRead : 0;
  const trafficDeltaWritten = this.lastTrafficWritten >= 0 ? trafficWritten - this.lastTrafficWritten : 0;
  this.lastTrafficRead = trafficRead;
  this.lastTrafficWritten = trafficWritten;

  return ok({
    metrics: {
      trafficRead,
      trafficWritten,
      trafficDeltaRead,
      trafficDeltaWritten,
      // ... other metrics ...
    },
  });
}
```

**Behavior**:
- First poll: deltas are 0 (sentinel -1 means no baseline yet)
- Subsequent polls: delta = current cumulative - previous cumulative
- State (`lastTrafficRead`, `lastTrafficWritten`) persists across polls
- Enables frontends to chart per-poll network activity (bytes sent/received per interval) without consuming storage for the full cumulative counter

**Tests**: `TorService.test.ts` includes assertions on delta computation and first-poll behavior.

## Task B7 — Tor Onionoo Supplemental Enrichment (COMPLETED 2026-05-07)

To add geolocation and consensus-weight context to ControlPort metrics, enrich them with optional Onionoo data without making Onionoo primary.

**Implementation** (`domain/services/tor/TorService.ts`):

```typescript
interface OnionooRelay {
  // ... existing fields ...
  as_name?: string;                      // New field (B7)
  consensus_weight_fraction?: number;    // New field (B7)
}

private async enrich(signal: AbortSignal): Promise<{
  country?: string;
  consensusWeight?: number;
  asName?: string;
  consensusWeightFraction?: number;
}> {
  try {
    const relay = await this.searchRelay(signal);
    if (!relay) return {};
    return {
      ...(relay.country_name ?? relay.country ? { country: relay.country_name ?? relay.country } : {}),
      ...(relay.consensus_weight !== undefined ? { consensusWeight: relay.consensus_weight } : {}),
      ...(relay.as_name !== undefined ? { asName: relay.as_name } : {}),
      ...(relay.consensus_weight_fraction !== undefined
        ? { consensusWeightFraction: relay.consensus_weight_fraction }
        : {}),
    };
  } catch {
    return {};  // Non-fatal: swallow errors silently
  }
}

async getStatsControlPort(signal: AbortSignal): Promise<StatsResult> {
  // ... fetch ControlPort metrics ...
  const enriched = await this.enrich(signal);
  return ok({
    metrics: {
      // ... core ControlPort metrics ...
      ...(enriched.country !== undefined ? { country: enriched.country } : {}),
      ...(enriched.consensusWeight !== undefined ? { consensusWeight: enriched.consensusWeight } : {}),
      ...(enriched.asName !== undefined ? { asName: enriched.asName } : {}),
      ...(enriched.consensusWeightFraction !== undefined
        ? { consensusWeightFraction: enriched.consensusWeightFraction }
        : {}),
    },
  });
}
```

**Behavior**:
- `enrich()` asynchronously calls `searchRelay()` to fetch Onionoo relay metadata
- Returns best-effort subset of 4 optional fields: `country`, `consensusWeight`, `asName`, `consensusWeightFraction`
- Errors are caught and silently swallowed — non-fatal fallback
- Enriched fields conditionally spread into the metrics object only when available
- ControlPort metrics are complete even if Onionoo is unavailable or times out
- ControlPort path remains primary; Onionoo is supplemental only
- Onionoo-only path (when `useControlPort=false`) unchanged

**Tests**: `TorService.test.ts` includes coverage of successful enrichment, missing fields, and error swallowing.

## Context

### Where the gap was found

A methodology audit of every service in `apps/backend/src/domain/services/` revealed two structural problems and a long tail of per-service under-monitoring.

#### Structural problem 1 — only 5/13 services run an ICMP probe

Current ping coverage:

| Pings | Does not ping |
| --- | --- |
| `roon`, `router`, `philipsBridge`, `raspberryPi` (fallback only), `macMini` | `bitcoin`, `ipfs`, `qbittorrent`, `tor`, `albyHub`, `synology`, `adguard`, `homebridge` |

Eight services rely solely on a protocol probe (HTTP, RPC, SNMP). When that probe fails, the dashboard cannot distinguish between:

- the host is unplugged / off the LAN,
- the host is up but the service crashed,
- the host is up, the service is up, but the API is hung.

ICMP is universally applicable, free at scale (one syscall per cycle), and yields a free latency metric ([[apps/backend/src/infra/net/pingProbe.ts|pingProbe.ts]]). There is no reason it is not running for every service.

#### Structural problem 2 — `HealthSnapshot` collapses both tiers into a single boolean

[[apps/backend/src/domain/BaseService.ts|BaseService.ts]] today:

```ts
export interface HealthSnapshot {
  reachable: boolean;
  latencyMs?: number;
  message?: string;
  details?: Readonly<Record<string, unknown>>;
  at: number;
}
```

`reachable` is overloaded. For `philipsBridge` it means "ICMP succeeded". For `bitcoin` it means "JSON-RPC `getblockchaininfo` returned". The frontend cannot render the two situations differently, and the time-series stores them as if they were the same metric.

#### Per-service shortfalls (summary — full matrix in §Decision)

- **tor** uses Onionoo (3rd-party, ~1 hour staleness, no local relay state) when the relay's local Tor daemon exposes a ControlPort with everything Onionoo has plus traffic counters and async `BW` events.
- **router** runs ping + TCP probe and nothing else, despite SNMP being the canonical router-monitoring transport (interface octets, errors, CPU, ARP table, link state).
- **philipsBridge** runs ICMP only — zero bridge state, zero light state, zero firmware-update signal.
- **bitcoin** polls `getblockchaininfo` / `getnetworkinfo` / `getmempoolinfo` but skips `getpeerinfo` (per-peer ping, banscore), `getnettotals` (bandwidth time-series), and the ZMQ push-notification socket (real-time block events without polling).
- **synology** uses SNMP v3 for OS-level metrics but the Synology MIB and DSM Web API surface per-disk SMART, RAID volume status, fan RPM, and DSM update state that we never read.
- **adguard** polls `/control/status` + `/control/stats` and skips `/control/clients`, `/control/filtering/status`, `/control/dhcp/status`, and `/control/querylog`.
- **homebridge** uses a generic configurable status path, ignoring the Config UI X API which exposes `cpu`, `ram`, `network/throughput`, `plugins` (with update flags), `accessories`.
- **roon** runs TCP probe only — zero zone/transport/library data despite the Roon API being available.
- **raspberryPi** routes its SSH commands through the Mac Mini service and uses a `rpi` CLI shim instead of native `vcgencmd` / `/proc` reads. `vcgencmd get_throttled` (undervoltage / throttling flags) is not surfaced anywhere.
- **macMini** uses `osx-cpu-temp` + `df` + `uptime` and skips `vm_stat` (real memory pressure), `smartctl` (disk SMART), `pmset` (power state).
- **qbittorrent** polls aggregate state buckets via `sync/maindata` but does not expose per-torrent detail or use `?rid=N` delta polling.
- **ipfs** polls the obvious five endpoints and skips `diag/sys`, DHT stats, pin counts, and listening-address verification.
- **albyHub** does multi-endpoint guessing (six probe paths) for what should be a single deterministic NWC API surface.

### Constraints

- ADR-018 puts the backend on an always-on Pi, so polling cadence is not bottlenecked by Mac sleep cycles. We can afford richer probes.
- LAN-only, no auth, no TLS (ADR-017). All upgrades stay inside the LAN.
- Single user, single client. No need to design for tenancy.
- Must remain compatible with the existing `BackgroundPoller` dual-loop (`healthMs`, `statsMs`) and the Result-typed `checkHealth` / `getStats` contract on `BaseService`.

## Decision

### Part A — Two-tier health model in `BaseService`

Evolve `HealthSnapshot` to carry both tiers explicitly:

```ts
export interface HostHealth {
  reachable: boolean;     // ICMP succeeded
  pingMs?: number;        // RTT from ping
}

export interface ServiceHealth {
  ok: boolean;            // protocol probe succeeded
  latencyMs?: number;     // protocol probe latency
  version?: string;       // surfaced by service when cheap
  message?: string;       // human-readable failure reason
  details?: Readonly<Record<string, unknown>>;
}

export interface HealthSnapshot {
  host: HostHealth;
  service: ServiceHealth;
  at: number;
}
```

Rules:

- `BaseService.checkHealth()` is responsible for both tiers. The ping is run in parallel with the protocol probe, not sequentially, so total wall-time is `max(ping, probe)`, not `ping + probe`.
- Services without a host (e.g., a hosted Onionoo lookup with no local target) may report `host: { reachable: true, pingMs: undefined }` and document the rationale in their service file.
- The frontend renders **two indicators per service**: host (network) and service (daemon). Three useful states emerge:
  - host ✅ + service ✅ → green
  - host ✅ + service ❌ → daemon issue (process crashed, hung, misconfigured)
  - host ❌ + service ❌ → network/host issue (off LAN, unplugged, sleeping)
- The time-series stores each tier as a separate boolean column so dashboards can chart "host uptime" and "service uptime" independently.

Helper to keep service implementations terse:

```ts
// apps/backend/src/domain/health.ts (new)
export async function withHostPing<T extends ServiceHealth>(
  host: string | undefined,
  probe: () => Promise<T>,
  signal: AbortSignal,
): Promise<HealthSnapshot> {
  const [hostResult, serviceResult] = await Promise.allSettled([
    host ? pingHost(host, signal) : Promise.resolve(null),
    probe(),
  ]);
  // ...build HealthSnapshot from both results
}
```

`pingHost` already exists at [[apps/backend/src/infra/net/pingProbe.ts|pingProbe.ts]] — no new infra primitive required.

### Part B — Per-service methodology upgrades

Authoritative target methodology per service. Migration sequencing in §Plan.

| Service | Today | Target methodology | New primitives |
| --- | --- | --- | --- |
| **bitcoin** | RPC: `getblockchaininfo`, `getnetworkinfo`, `getmempoolinfo`, `uptime` | + `getpeerinfo` (per-peer ping/banscore), + `getnettotals` (bandwidth counters), + `getmininginfo`, + `getindexinfo`, + ZMQ subscription (`hashblock`, `rawtx`) for push events | ZMQ client in `infra/zmq/` |
| **ipfs** | `version`, `id`, `swarm/peers`, `repo/stat`, `stats/bw` | + `diag/sys` (Go runtime, FD count), + `stats/dht`, + `pin/ls --type=recursive` (count only), + `swarm/addrs/listen` | None — reuse `infra/http` |
| **qbittorrent** | `app/version`, `app/preferences`, `sync/maindata`, `transfer/info` | + `torrents/info` (per-torrent detail), + `sync/maindata?rid=N` (delta polling), + `log/main?last_known_id=N` (events) | None |
| **tor** | Onionoo `/details?search={nickname}` only | **Replace** with Tor ControlPort: `GETINFO status/circuit-established`, `traffic/read`, `traffic/written`, `accounting/bytes`, `accounting/bytes-left`, `ns/id/{fingerprint}`, `dormant`, `version/current`. Subscribe to async events `BW`, `NEWCONSENSUS`, `GUARD`, `STATUS_GENERAL`. Keep Onionoo as supplemental for consensus weight + geolocation only. | Tor control-port client in `infra/tor/` (file exists, build out) |
| **albyHub** | Guess across 6 paths | Pin to deterministic NWC endpoints (`/api/info`, `/api/balance`, `/api/channels`, `/api/transactions`, `/api/peers`) after verifying actual API surface against running instance | None |
| **synology** | SNMP v3 (system, CPU, memory, disk, network) | + Synology MIB extensions (per-disk temp, per-disk SMART, RAID volume status, fan RPM, UPS table). + DSM Web API (`SYNO.Storage.CGI.Storage`, `SYNO.Core.System.Status`, `SYNO.DSM.Info`) for richer storage + update state | DSM API client in `infra/synology/` |
| **adguard** | `/control/status`, `/control/stats` | + `/control/clients`, + `/control/filtering/status`, + `/control/dhcp/status` (when applicable), + `/control/safebrowsing/status`, + `/control/parental/status`, + `/control/safesearch/status`, + `/control/dns_info` | None |
| **homebridge** | Configurable status/version path | Switch default to Homebridge Config UI X API (port 8581): `/api/status/homebridge`, `/api/status/cpu`, `/api/status/ram`, `/api/status/network`, `/api/plugins`, `/api/accessories`. JWT auth via `/api/auth/login`. | JWT-aware client (small extension to `infra/http`) |
| **roon** | TCP probe only | Roon API WebSocket (port 9100/9330) via `node-roon-api`. Zones, transport state, currently playing, library counts. One-time pairing flow. | `infra/roon/` new |
| **philipsBridge** | ICMP only | Hue API v2 (`https://{bridge-ip}/clip/v2/resource/...`, `hue-application-key` header): bridge info, light state, Zigbee mesh status, firmware update flag. Self-signed cert pinning via cert hash stored at config time. | Cert-pinning HTTPS client in `infra/http/` |
| **raspberryPi** | pigpiod + ICMP fallback + SSH via `macMini` relay | Direct SSH to the Pi (no relay). Native commands: `vcgencmd measure_temp / measure_volts core / measure_clock arm`, `vcgencmd get_throttled`, `cat /sys/class/thermal/thermal_zone0/temp`, `/proc/loadavg`, `/proc/meminfo`, `/proc/stat`, `/proc/uptime`. Keep pigpiod for GPIO read/write only — stop conflating it with availability. | Reuse `infra/ssh`; remove macMini relay coupling |
| **macMini** | ping + SSH (`uptime`, `df`, `osx-cpu-temp`) | + `vm_stat` (real memory pressure), + `sysctl hw.memsize hw.ncpu hw.cpufrequency`, + `smartctl -a /dev/disk0` (SMART), + `pmset -g batt`, + `top -l 1 -n 0 -s 0` (idle %), + `ifconfig en0` | Reuse `infra/ssh` |
| **router** | ICMP + TCP port list | SNMP v2c/v3 primary: `IF-MIB::ifTable` (per-iface octets/errors), `IF-MIB::ifOperStatus`, `SNMPv2-MIB::sysUpTime`, `HOST-RESOURCES-MIB::hrProcessorLoad`, `HOST-RESOURCES-MIB::hrStorageTable`, `IP-MIB::ipNetToMediaTable` (ARP → connected-client count). Optional UPnP IGD for WAN bytes when SNMP unavailable. | Reuse `infra/snmp`; UPnP client in `infra/upnp/` (optional, deferred) |

### Part B.1 — Tor ControlPort Authentication (Task B3 — COMPLETED 2026-05-07)

**Cookie Auth Mechanism:**

Tor's control-port security model supports three authentication modes:

1. **Control auth cookie** (default, most secure): Tor writes a 32-byte binary cookie to a filesystem path (typically `/var/lib/tor/control_auth_cookie` when built with `--enable-control-socket-is-world-writable=no`). Protocol: hex-encode the bytes, send `AUTHENTICATE <64-char hex>\r\n`.
2. **HashedControlPassword**: plaintext password hashed at startup. Protocol: send `AUTHENTICATE "password"\r\n` (with escaping).
3. **No auth**: When ControlPort is restricted to localhost and no auth is configured. Protocol: send bare `AUTHENTICATE\r\n`.

**Implementation** (`infra/tor/controlClient.ts`):

```typescript
interface TorControlConnectOpts {
  host: string;
  port: number;
  password: string;
  cookieAuthFile?: string;  // Path to control auth cookie binary file
  timeoutMs: number;
}

async authenticate(password: string, signal: AbortSignal, cookieAuthFile?: string): Promise<void> {
  let cmd: string;
  if (cookieAuthFile && cookieAuthFile.length > 0) {
    const cookieBytes = await readFile(cookieAuthFile);
    cmd = `AUTHENTICATE ${cookieBytes.toString('hex')}\r\n`;
  } else if (password.length > 0) {
    cmd = `AUTHENTICATE "${escapePassword(password)}"\r\n`;
  } else {
    cmd = 'AUTHENTICATE\r\n';
  }
  // send cmd, read response, check for 250 OK or 515 UnauthorizedError
}
```

**Config Schema** (`TorInstanceSchema`):

```typescript
cookieAuthFile: z.string().default('')  // Empty string = disabled, fall through to password auth
```

**Tests** (`infra/tor/controlClient.test.ts`):

Three new unit tests in a `describe('cookie auth')` block:
1. Verifies hex encoding is sent without quotes (RFC 5050 compliance)
2. Verifies cookie auth succeeds and handle remains usable for GETINFO
3. Verifies `515` response throws `UnauthorizedError` (cookie mismatch)

**Deployment guidance:**

- If Tor is built with cookie auth enabled, configure `TOR_CONTROL_COOKIE_AUTH_FILE=/var/lib/tor/control_auth_cookie`
- If using plaintext password fallback, set `TOR_CONTROL_PASSWORD=<plaintext>` and leave `cookieAuthFile` empty
- Cookie auth takes precedence if both are set

### Part C — Configuration & rollout policy

- Each upgrade ships behind a per-service config flag (e.g., `tor.useControlPort: boolean`) with default `false` until verified against a real instance, then flipped to `true`. Onionoo remains a fallback for the Tor case so a misconfigured ControlPort cannot black out the dashboard.
- `BaseService.pollPolicy` gains an optional third field `pingMs` (default = `healthMs`) so ICMP can run at a higher cadence than full protocol health if useful.
- Frontend renders two-tier indicator unconditionally; legacy single-tier services compute `host.reachable` from the existing protocol probe until ICMP support is wired in.

## Consequences

### Positive

- **Diagnostic clarity.** Two-tier health distinguishes network failure from daemon failure on the dashboard at zero extra polling cost (the ping runs in parallel).
- **Real-time signal where push exists.** Tor `BW`/`NEWCONSENSUS` events and Bitcoin ZMQ deliver block-level signal without polling, reducing both staleness and load.
- **Independence from third parties.** Tor monitoring stops depending on Onionoo's ~1-hour staleness and external availability.
- **Richer time-series.** Bandwidth counters (router SNMP, bitcoin `getnettotals`, ipfs `stats/bw`) feed bandwidth charts that today don't exist.
- **Diagnostic depth.** `vcgencmd get_throttled` flags Pi undervoltage; per-disk SMART flags Synology disk failure before the OS does; `vm_stat` flags Mac memory pressure that `free`-style metrics miss.
- **Less guessing.** Albyhub stops doing 6-path probes; Hue bridge stops being a pure ping target.

### Negative

- **More native dependencies.** Tor control protocol, Roon WebSocket library, ZMQ client, optionally UPnP — each is a new transitive dependency on the Pi-arm64 build.
- **More config surface.** Tor ControlPort password / cookie auth, Hue application-key, Homebridge Config UI X JWT, Roon extension pairing — each adds a field to the UI-driven service configuration ([[docs/adr/015-ui-driven-service-configuration|ADR-015]]).
- **Cert handling.** Hue bridge uses a self-signed cert. Need either pinning (preferred) or `rejectUnauthorized: false` (last resort).
- **Two-tier rendering work.** Frontend service tiles need a two-light indicator and the time-series schema gains a column.

### Risks

- **ControlPort lockout.** If the user runs Tor with `ControlPort 0` (default) the upgrade silently degrades to "unreachable". Mitigation: fall back to Onionoo when ControlPort connect fails, surface a setup hint in the UI.
- **SNMP authentication drift.** Router SNMP credentials may not match Synology v3 conventions. Mitigation: per-service SNMP profile, not a shared one.
- **Roon pairing UX.** Roon API requires one-time extension approval inside the Roon app. Mitigation: setup-wizard step, retry-friendly.
- **API churn.** AlbyHub is young software; endpoints may rename. Mitigation: keep multi-path probe code path behind a config flag we can flip back on.
- **Pi `smartctl` on macOS.** macMini upgrades require `smartmontools` install; not guaranteed. Mitigation: feature-detect, omit metric if absent.

## Alternatives Considered

| Alternative | Why Rejected |
| --- | --- |
| Keep single-tier `reachable` and overload `details.network` | Frontend can't reason about it generically; time-series can't chart "host vs service" without parsing the bag. |
| Run ping sequentially before protocol probe | Doubles health-check wall time on the slowest hosts (Synology SNMP, Bitcoin RPC). Parallel `Promise.allSettled` is free. |
| Skip ping for HTTP services since HTTP itself proves host reachability | Wrong: a 5xx, hung connection, or TCP RST proves nothing about ICMP. The whole point is to disentangle layers. |
| Replace Onionoo with ControlPort and drop Onionoo entirely | Onionoo has consensus weight and country geolocation that ControlPort doesn't expose. Keep both, ControlPort primary. |
| Use Prometheus node_exporter on Pi/Mac Mini and consume metrics directly | Adds a second daemon per host; existing SSH/SNMP path is good enough and avoids the operator cost. Revisit if the metric list grows. |
| Switch router monitoring to OpenWrt-only via SSH | Excludes consumer routers without OpenWrt. SNMP works on consumer + prosumer. SSH stays as an *optional* secondary path. |
| Roon: just expose TCP up/down and call it done | Leaves the most music-centric service in the lab as the least observed. Roon API is well-documented; the lift is justified. |

## Plan

See [[docs/guides/monitoring-upgrade-plan|Monitoring Upgrade Plan]] for sequencing, owner-action items, verification steps per phase, and rollback notes. Phases summarised:

1. **P0a — Two-tier health (`BaseService`).** Refactor type, add `withHostPing` helper, update all 13 services to populate both tiers (ping for the 8 that don't yet ping). Update frontend to render two indicators. Migrate time-series schema.
2. **P0b — Tor ControlPort.** Build out [[apps/backend/src/infra/tor|infra/tor]], wire `TorService` to ControlPort, keep Onionoo as fallback.
3. **P0c — Router SNMP.** Reuse [[apps/backend/src/infra/snmp|infra/snmp]] for `RouterService`; per-service SNMP profile.
4. **P0d — Hue API v2.** Cert-pinning HTTPS client; Hue application-key in service config.
5. **P1a — Bitcoin: `getpeerinfo` + `getnettotals` + ZMQ.**
6. **P1b — Synology: per-disk SMART + RAID volume status (DSM API + extended SNMP).**
7. **P1c — Roon WebSocket API + setup-wizard pairing step.**
8. **P1d — Homebridge Config UI X API (JWT auth).**
9. **P2a — Raspberry Pi: direct SSH, native `vcgencmd` + `/proc`, decouple from macMini.**
10. **P2b — qBittorrent: per-torrent detail + delta `?rid=N`.**
11. **P2c — AdGuard: clients + filtering + DHCP + safebrowsing/parental/safesearch endpoints.**
12. **P2d — macMini: `vm_stat`, `smartctl`, `pmset`.**
13. **P3a — IPFS: `diag/sys`, DHT stats, pin counts.**
14. **P3b — AlbyHub: pin NWC endpoints once verified against live instance.**

## References

### Architecture & Planning
- [[docs/adr/index|ADR Index]]
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] — `BackgroundPoller` dual-loop this builds on
- [[docs/adr/018-split-deploy-pi-backend|ADR-018]] — always-on Pi backend (enables richer probes)
- [[docs/guides/monitoring-upgrade-plan|Monitoring Upgrade Plan]] — phase-by-phase migration plan
- [[docs/testing/testing-strategy.md|Testing Strategy]] — service class and protocol testing patterns (Phase 0b+)
- [[docs/integrations/tor|Tor Integration]] — ControlPort details and configuration

### Implementation (Phase 0b — Tor ControlPort + Task B3 — Cookie Auth + Task B4 — GETCONF/SIGNAL + Task B5 — Event Subscription + Task B6 — Traffic Deltas + Task B7 — Onionoo Enrichment)
- [[apps/backend/src/infra/tor/controlClient.ts|controlClient.ts]] — Tor Control Protocol client with TCP socket wrapper, async parser, cookie auth support (Task B3), GETINFO/GETCONF/SIGNAL commands (Task B4)
- [[apps/backend/src/infra/tor/controlClient.test.ts|controlClient.test.ts]] — Fake TCP server protocol tests including cookie auth, GETINFO, GETCONF, SIGNAL commands
- [[apps/backend/src/infra/tor/eventSubscription.ts|eventSubscription.ts]] (Task B5) — Event subscription with persistent TCP socket, async event routing, FIFO reply queue, handler registry, clean shutdown
- [[apps/backend/src/domain/services/tor/TorService.ts|TorService.ts]] — Two-tier health dispatch; lifecycle methods `onStart()` / `onStop()` for event subscription (Task B5); bwRead/bwWritten metrics from BW events; traffic delta tracking (Task B6: lastTrafficRead, lastTrafficWritten fields, delta computation); Onionoo enrichment (Task B7: `enrich()` method, conditional spread of enrichment fields)
- [[apps/backend/src/domain/services/tor/TorService.test.ts|TorService.test.ts]] — ControlPort path tests, lifecycle and event subscription coverage, traffic delta assertions, Onionoo enrichment coverage
- [[apps/backend/src/bootstrap/registerServices.ts|registerServices.ts]] (Task B5) — Passes `createTorEventSubscriptionFactory()` to Tor service

### Core Infrastructure
- [[apps/backend/src/domain/BaseService.ts|BaseService.ts]] — health contract being evolved
- [[apps/backend/src/infra/net/pingProbe.ts|pingProbe.ts]] — existing ICMP primitive
- [[apps/backend/src/infra/scheduler|BackgroundPoller]] — poll cadence orchestration
- [[apps/backend/src/infra/snmp|infra/snmp]] — SNMP primitive (Synology today, router target)
- [[apps/backend/src/infra/ssh|infra/ssh]] — SSH primitive (Mac Mini today, Pi target)
- [[apps/backend/src/infra/gpio|infra/gpio]] — pigpio client (keep for GPIO, remove from health-check role)
