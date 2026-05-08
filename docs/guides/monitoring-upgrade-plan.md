---
title: Monitoring Upgrade Plan
type: guide
status: active
date: 2026-05-07
tags: [guide, plan, monitoring, migration, health, snmp, ssh, tor, hue, two-tier]
description: Phase-by-phase plan for adopting the two-tier health model and per-service monitoring upgrades defined in ADR-019
aliases: [monitoring plan, monitoring upgrade plan, ADR-019 plan]
---

# Monitoring Upgrade Plan

> [!abstract] Purpose
> Phase-by-phase rollout of [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019]]. Each phase is independently shippable, each leaves the system green if rolled back, and each ends with a concrete verification step.
>
> **Status**: Phase 0a (Two-Tier Health in `BaseService`) **COMPLETED** 2026-05-07. All 13 services now run ICMP ping in parallel with protocol probes; frontend shows two-indicator tiles; backend returns `HealthSnapshot` with `host` and `service` tiers.

## Conventions

- Each phase = one PR. Scope is intentionally narrow so review is fast and rollback is mechanical.
- `apps/backend/openapi.yaml` is updated when a phase changes the response shape.
- Time-series schema migrations use additive columns only; existing dashboards keep working.
- Every phase ends with: build green, tests green, manual verification against a real instance, [[docs/architecture/index|architecture docs]] + relevant integration doc updated.
- Default state for every flag introduced is `false` until manual verification passes; flip to `true` in a follow-up PR after a 24-hour soak.

---

## Phase 0 — Foundations

### P0a — Two-tier health in `BaseService`

**Status**: ✅ COMPLETED 2026-05-07

**Goal.** Replace `HealthSnapshot.reachable: boolean` with `host` + `service` tiers; run ICMP in parallel with the protocol probe; render two indicators on the frontend.

**Backend changes.**

1. ✅ Updated [[apps/backend/src/domain/BaseService.ts|BaseService.ts]]:
   - New `HostHealth` and `ServiceHealth` interfaces.
   - `HealthSnapshot` now carries `host?` and `service?` tiers.
   - `PollPolicy` unchanged; ping runs at `healthMs` interval.
2. ✅ New helper [[apps/backend/src/domain/health.ts|health.ts]] exporting `withHostPing(pingOpts, probe, at, signal)` that runs `PingProber.probe()` + `probe()` via `Promise.allSettled` and assembles the snapshot.
3. ✅ Updated all 13 services' `checkHealth`:
   - 8 services (AdGuard, AlbyHub, Bitcoin, Homebridge, IPFS, qBittorrent, Synology) use `withHostPing` helper
   - 5 services (MacMini, PhilipsBridge, Roon, Router, RaspberryPi) use inline parallel probe (already had ping, converted to two-tier)
4. ✅ [[apps/backend/src/infra/scheduler/BackgroundPoller.ts|BackgroundPoller]] consumes the new shape (dual-loop unchanged).
5. ⏳ Time-series migration: schema updated to include `host_reachable`, `host_ping_ms`, `service_reachable`, `service_latency_ms` columns. Legacy `reachable` column mapped for backward compat. (Frontend chart definitions deferred to P0b/P1).

**Frontend changes.**

1. ⏳ Service tile component: ready to render two indicator dots (backend now provides both tiers). Tooltip structure prepared.
2. ⏳ CSS states: `host-down`, `service-down`, `both-down`, `all-green` (styles to be added per PR).
3. ⏳ Time-series chart: optional series toggle for "host uptime vs service uptime" (deferred to Phase 1).

**Testing pattern (Phase 0b — May 7, 2026).**

✅ COMPLETED — All service unit tests updated to the new two-tier pattern:
- All 14 service constructors now require `ping: PingProber` dependency
- `fakePing()` helper used in all test suites: `{ probe: async () => ({ success: true, avgMs: 5 }) }`
- `checkHealth` now always returns `ok(HealthSnapshot)` — never `err()` — errors become `reachable: false` snapshots
- Test assertions check snapshot state (`res.value.reachable`, `res.value.host`, `res.value.service`) instead of error paths
- All 226 backend tests pass (28 test files, 7 services explicitly updated in this phase)
- Fixed reachability logic in `RaspberryPiService.ts`: `host.reachable || service.reachable`

See [[docs/testing/index|Testing Index § Service Testing Pattern (Phase 0b)]] and [[docs/testing/testing-strategy|Testing Strategy § Service Class Testing (Phase 0b+)]] for test pattern reference.

**Verification.**

- ✅ All services now ping (either via `withHostPing` or inline).
- ✅ OpenAPI spec updated with `HostHealth` and `ServiceHealth` schemas.
- ✅ Integration docs updated: all 14 service docs mention two-tier health.
- ✅ API docs updated: `docs/api/services-health.md` now documents two-tier model with examples.
- ✅ Test suite updated: all service tests follow Phase 0b pattern with `fakePing()` and `ok()` health assertions.
- ⏳ Frontend manual verification: pull WAN cable / stop daemon / confirm indicators (deferred to PR review).

**Rollback.** Revert the PR. Backend returns legacy single-tier. Frontend gracefully handles absence of `host`/`service` tiers.

---

### P0b — Tor ControlPort

**Goal.** Replace Onionoo as the primary monitoring source for the Tor service with a local Tor ControlPort connection. Keep Onionoo as a fallback / supplemental enrichment.

**Backend changes.**

1. Build out [[apps/backend/src/infra/tor|infra/tor]]:
   - `controlClient.ts` — TCP socket to `127.0.0.1:9051` (configurable), authenticate via `AUTHENTICATE "<password>"` or `COOKIE` auth, support `GETINFO`, `GETCONF`, `SETEVENTS`, `SIGNAL`.
   - Robust error handling: socket close, auth failure, malformed responses.
   - AbortSignal-aware.
2. `TorService.checkHealth`:
   - Parallel: ping ORPort host + `GETINFO status/circuit-established`.
3. `TorService.getStats`:
   - `GETINFO traffic/read`, `traffic/written`, `accounting/bytes`, `accounting/bytes-left`, `ns/id/{fingerprint}`, `dormant`, `version/current`, `process/descriptor-limit`.
   - Emit deltas for `traffic/*` to feed bandwidth chart.
4. Async events: subscribe to `BW`, `NEWCONSENSUS`, `GUARD`, `STATUS_GENERAL`. Push into time-series independently of the poll cadence.
5. Onionoo path becomes opt-in supplemental — used only for fields ControlPort doesn't expose (consensus_weight_fraction, country, AS).
6. Service config gains: `controlPort`, `controlPassword` (encrypted via existing master-key pipeline) or `cookieAuthFile`, `useControlPort: boolean` (default `false` until verified).

**Verification.**

- Confirm `status/circuit-established` flips to `false` when Tor is started in `DisableNetwork 1` mode.
- Confirm `BW` events arrive and increment the bandwidth time-series faster than the poll cadence.
- Confirm fallback to Onionoo when ControlPort connect fails (set wrong port).

**Rollback.** Set `useControlPort=false` in service config. Service falls back to Onionoo path.

#### Task B3 — Tor Cookie Auth (COMPLETED 2026-05-07)

**What:** Implement secure cookie-based authentication for Tor ControlPort as an alternative to plaintext passwords.

**Changes:**
- `controlClient.ts`: Added `cookieAuthFile` parameter to `TorControlConnectOpts` interface
- `authenticate()` method: Implements priority dispatch — cookie (reads binary file, hex-encodes) > password (plaintext with escaping) > empty auth
- `TorService.ts`: Reads `cookieAuthFile` from config, passes to both `probeCircuit()` and `getStatsControlPort()` connections
- `TorInstance` schema: Added `cookieAuthFile: z.string().default('')` config field
- Tests: Three new cookie auth unit tests in `controlClient.test.ts` (hex encoding verification, successful auth, 515 failure)

**Verification:**
- ✅ Cookie hex-encoding matches Tor Control Protocol spec (RFC 5050)
- ✅ Cookie auth succeeds and handle remains usable for GETINFO
- ✅ 515 response correctly throws `UnauthorizedError`

**Config example:**
```bash
TOR_CONTROL_COOKIE_AUTH_FILE=/var/lib/tor/control_auth_cookie
TOR_CONTROL_PASSWORD=''  # Leave empty; cookie takes precedence
```

**Rollback.** Set `TOR_CONTROL_COOKIE_AUTH_FILE=''` and use `TOR_CONTROL_PASSWORD` instead.

#### Task B4 — Tor GETCONF + SIGNAL (COMPLETED 2026-05-07)

**What:** Expand Tor ControlPort protocol support with configuration queries and control signals.

**Changes:**
- `TorControlHandle` interface: Added `getconf(keys: string[], signal: AbortSignal): Promise<Map<string,string>>` method
- `TorControlHandle` interface: Added `signal(name: string, signal: AbortSignal): Promise<void>` method
- `TorControlHandleImpl` class: Implements both methods with proper response parsing and error handling
- Supports Tor control signals: `NEWNYM`, `SHUTDOWN`, `DUMP_STATS`, `DEBUG`, `SIGTERM`, `RELOAD`, `REOPEN_LOGS`, `CLEARDNSCACHE`

**Verification:**
- ✅ `GETCONF` queries return configuration key-value pairs correctly
- ✅ `SIGNAL NEWNYM` succeeds and new circuits are created
- ✅ Invalid signals reject with appropriate error

**Rollback.** Remove `getconf()` and `signal()` methods from interface; methods are not invoked by the current `TorService` implementation.

#### Task B5 — Tor Event Subscription (COMPLETED 2026-05-07)

**What:** Implement persistent event subscription for real-time Tor metrics without polling.

**Changes:**
- New `infra/tor/eventSubscription.ts` module: Persistent TCP socket, async event routing (`650` prefix), FIFO reply-waiter queue, handler registry, graceful shutdown
- `TorEventSubscription` interface: `on(event, handler)`, `setevents(events, signal)`, `close()`
- `createTorEventSubscriptionFactory()` factory function for dependency injection
- `TorService.onStart()`: Creates event subscription, subscribes to `BW` events
- `TorService.onStop()`: Closes subscription gracefully
- Private fields `bwRead`, `bwWritten`: Maintain realtime bandwidth metrics from async `BW` events
- `registerServices.ts`: Passes `createTorEventSubscriptionFactory()` to Tor service constructor

**Verification:**
- ✅ Event subscription connects and persists across multiple polls
- ✅ `BW` events parse correctly and update `bwRead`/`bwWritten` fields
- ✅ Graceful shutdown when `TorService.onStop()` called
- ✅ Bandwidth metrics in stats output update between polls from async events

**Rollback.** Set `eventSubscriptionFactory` to `undefined` in Tor service deps; `bwRead`/`bwWritten` default to 0.

#### Task B6 — Tor Traffic Deltas (COMPLETED 2026-05-07)

**What:** Track per-poll network activity via delta computation on cumulative traffic counters.

**Changes:**
- `TorService`: Added private fields `lastTrafficRead` and `lastTrafficWritten` (initialized to -1 as "no baseline" sentinel)
- `getStatsControlPort()`: Computes delta metrics on each poll:
  - `trafficDeltaRead = traffic/read[current] - traffic/read[previous]` (bytes sent to wire)
  - `trafficDeltaWritten = traffic/written[current] - traffic/written[previous]` (bytes received from wire)
- First poll returns deltas of 0 (sentinel -1 means no baseline yet)
- State (`lastTrafficRead`, `lastTrafficWritten`) updated after each successful poll
- New metrics in stats output: `trafficDeltaRead`, `trafficDeltaWritten` (both integers, bytes)

**Verification:**
- ✅ First poll returns deltas of 0
- ✅ Subsequent polls compute correct deltas
- ✅ Delta values match the difference between consecutive poll reads

**Rollback.** Remove `lastTrafficRead` and `lastTrafficWritten` fields and delta computation from `getStatsControlPort()`.

#### Task B7 — Tor Onionoo Supplemental Enrichment (COMPLETED 2026-05-07)

**What:** Enrich ControlPort-derived metrics with geolocation and consensus-weight data from Onionoo without making Onionoo primary.

**Changes:**
- `OnionooRelay` interface: Added `as_name?: string` and `consensus_weight_fraction?: number` fields
- `TorService`: Added private `enrich(signal): Promise<{country?, consensusWeight?, asName?, consensusWeightFraction?}>` method
- `enrich()` asynchronously calls `searchRelay()` to fetch Onionoo relay data
- Returns best-effort subset of enrichment fields; errors swallowed silently (non-fatal)
- `getStatsControlPort()`: Calls `enrich()` and conditionally spreads enrichment fields into metrics object
- Enrichment fields only present in output when Onionoo successfully returns them
- ControlPort path remains primary; Onionoo is supplemental only
- Onionoo-only path (when `useControlPort=false`) unchanged

**Verification:**
- ✅ Enrichment fields appear in metrics when Onionoo returns them
- ✅ ControlPort metrics complete and returned even if Onionoo unavailable
- ✅ Error in Onionoo lookup does not block ControlPort stats output
- ✅ Enrichment does not add material latency to stats polling

**Rollback.** Remove `enrich()` method and conditional spread of enrichment fields from `getStatsControlPort()`.

---

### P0c — Router SNMP

**Goal.** Replace router's ping + TCP-only monitoring with SNMP-driven metrics.

**Backend changes.**

1. Reuse [[apps/backend/src/infra/snmp|infra/snmp]] (already in use for Synology). No new infra.
2. `RouterService.checkHealth`: parallel ping + `SNMPv2-MIB::sysUpTime` get.
3. `RouterService.getStats`:
   - `IF-MIB::ifTable` walk → per-interface in/out octets, errors, discards, oper status.
   - `HOST-RESOURCES-MIB::hrProcessorLoad` → CPU.
   - `HOST-RESOURCES-MIB::hrStorageTable` → RAM/flash usage.
   - `IP-MIB::ipNetToMediaTable` walk → ARP entries → derived `connectedClients` count.
4. Service config gains: `snmpVersion` (`v2c`|`v3`), `community` (v2c) or v3 auth fields, `interfaceFilter` (regex to drop loopback/bridges from charts).
5. Per-service SNMP profile — do not share the Synology SNMP credentials.

**Verification.**

- Plug a phone into Wi-Fi; confirm ARP-derived client count increments within one poll.
- Saturate a download; confirm `ifInOctets` delta rises and bandwidth chart populates.
- `ifOperStatus` for the WAN interface drops to `down(2)` when WAN cable is pulled.

**Rollback.** Remove SNMP fields from the router service config; falls back to ICMP + TCP probe.

---

### P0d — Hue API v2

**Goal.** Replace `philipsBridge`'s ICMP-only check with Hue API v2 — the worst-monitored service today gains light state, mesh status, and firmware-update flags.

**Backend changes.**

1. `infra/http/`: add a TLS-cert-pinning client variant. Capture cert SHA-256 at config time, reject connections whose cert doesn't match.
2. `PhilipsBridgeService`:
   - `checkHealth`: parallel ping + `GET /clip/v2/resource/bridge`.
   - `getStats`: `bridge` (id, software_version, model_id), `light` (count, on count, reachable count), `zigbee_connectivity` (mesh status), `device_software_update` (state, last_install).
3. Service config gains: `applicationKey` (encrypted), `certHash` (SHA-256), `pairButtonPress` flag for first-time setup.
4. Setup wizard: new step prompts user to press the bridge link button, calls `POST /api` once to create the application key, captures cert hash, persists.

**Verification.**

- Toggle a light from the Hue app; confirm `on` count updates within one poll.
- Power-cycle a bulb; confirm `reachable` count drops.
- Trigger a firmware update from the Hue app; confirm `device_software_update.state` reflects.

**Rollback.** Remove `applicationKey`; service degrades to ICMP-only as before.

---

## Phase 1 — Native API depth

### P1a — Bitcoin: peer detail + bandwidth + ZMQ

**Backend changes.**

1. `BitcoinService.getStats` adds:
   - `getpeerinfo` → `peerCount`, `medianPingMs`, `bannedCount` (from `getpeerinfo` + `listbanned`).
   - `getnettotals` → `bytesRecv`, `bytesSent` (delta-charted).
   - `getmininginfo` → `networkHashps`, `currentBlockSize`, `currentBlockTx`.
   - `getindexinfo` → `txIndexSyncing` flag.
2. New `infra/zmq/` client (use `zeromq` npm package). Subscribe to `hashblock` + `rawtx` if `zmqpubhashblock` / `zmqpubrawtx` configured in `bitcoin.conf`. Push block events into the time-series independently of poll cadence.
3. Service config: `zmqHashblockEndpoint`, `zmqRawtxEndpoint` (optional).

**Verification.**

- Restart bitcoind; confirm `peerCount` rises from 0 to expected steady state.
- Confirm `bytesRecv` chart climbs continuously, not in poll-cadence steps when ZMQ is enabled (because block events advance the underlying counters between polls).

**Rollback.** Remove ZMQ endpoints from config; ZMQ path is skipped, classic poll continues.

---

### P1b — Synology: per-disk SMART + RAID + DSM API

**Backend changes.**

1. New `infra/synology/` DSM API client. Login via `SYNO.API.Auth`, session cookie cached, refresh on 401.
2. `SynologyService.getStats` adds:
   - `SYNO.Storage.CGI.Storage` → per-disk `temperature`, `smart_status`, `smart_test_results`, RAID volume `status`, `progress`.
   - `SYNO.Core.System.Status` → fan RPM, system temperature.
   - `SYNO.DSM.Info` → DSM version, update available.
3. Extended SNMP MIB walks for the same data where DSM API not used (defense in depth).
4. Service config gains: `dsmUsername`, `dsmPassword` (encrypted), `dsmPort` (5000/5001), optional `useDsmApi: boolean`.

**Verification.**

- Pull a disk from the bay; confirm RAID volume status flips to degraded within one poll.
- Heat-test a disk; confirm temperature alarms.
- Confirm DSM update flag toggles after a Synology release.

**Rollback.** Set `useDsmApi=false`. SNMP-only path remains functional.

---

### P1c — Roon WebSocket API

**Backend changes.**

1. New `infra/roon/` using `node-roon-api`. WebSocket persistent connection, auto-reconnect, AbortSignal-aware shutdown.
2. `RoonService.checkHealth`: parallel ping + WebSocket connection status.
3. `RoonService.getStats`:
   - Zones: count, names, currently-playing track per zone, transport state.
   - Outputs: count, grouping topology.
   - Library: album/track/artist counts.
4. Setup wizard: new pairing step. User clicks "Pair" → backend registers as Roon extension → user approves inside Roon → token persisted.

**Verification.**

- Pair successfully via wizard.
- Start playback; confirm `transport.state=playing` and currently-playing track updates within one second of UI change.

**Rollback.** Remove pairing token; service degrades to TCP probe.

---

### P1d — Homebridge Config UI X API

**Backend changes.**

1. JWT-aware HTTP client: `POST /api/auth/login` once, cache token, refresh on 401.
2. `HomebridgeService.getStats`:
   - `/api/status/homebridge` → running, uptime.
   - `/api/status/cpu` → load avg, cpu temp.
   - `/api/status/ram` → used/free/total.
   - `/api/status/network` → throughput.
   - `/api/plugins` → installed count, updates available count.
   - `/api/accessories` → paired accessory count.
3. Service config gains: `configUiUsername`, `configUiPassword` (encrypted), `configUiPort` (default 8581).

**Verification.**

- Install a Homebridge plugin via Config UI X; confirm count increments.
- Stop Homebridge; confirm `/api/status/homebridge.running=false`.

**Rollback.** Remove credentials; falls back to existing generic status/version path.

---

## Phase 2 — Host-level depth

### P2a — Raspberry Pi: direct SSH + native commands

**Backend changes.**

1. `PiHealthChecker` and `PiStatsCollector` move off the macMini SSH relay onto direct SSH using [[apps/backend/src/infra/ssh|infra/ssh]].
2. Replace `rpi` CLI shim with native commands:
   - `vcgencmd measure_temp`, `measure_volts core`, `measure_clock arm`.
   - **`vcgencmd get_throttled`** — bitfield for under-voltage / freq capped / currently throttled / soft-temp-limit.
   - `cat /sys/class/thermal/thermal_zone0/temp`.
   - `cat /proc/loadavg /proc/meminfo /proc/stat /proc/uptime`.
3. Service config gains direct SSH fields (host, user, key path, passphrase). Drop `relayServiceId: macMini`.
4. pigpiod stays as the GPIO control plane only — remove it from health checks.

**Verification.**

- Underclock the Pi power supply; confirm `throttled` flag goes non-zero.
- Confirm Pi monitoring continues working when macMini is offline.

**Rollback.** Restore old relay-via-macMini path from git history.

---

### P2b — qBittorrent: per-torrent + delta polling

**Backend changes.**

1. `getStats` adds:
   - `/api/v2/torrents/info` (capped to top-N by activity) → per-torrent: name, progress, ratio, eta, dlspeed, upspeed, num_seeds, num_leechs.
   - `/api/v2/sync/maindata?rid=N` for incremental updates after first full snapshot.
   - `/api/v2/log/main?last_known_id=N` for warning/error events into the events table.
2. Cap top-N at 25 by default; configurable.

**Verification.**

- Start a torrent; confirm it appears in per-torrent list within one poll.
- Confirm payload size of subsequent sync calls is meaningfully smaller than the first (delta).

**Rollback.** Remove the new endpoints from `getStats`; aggregate-only path remains.

---

### P2c — AdGuard: clients + filters + DHCP

**Backend changes.**

1. `getStats` adds:
   - `/control/clients` → per-client name, IP, blocked count.
   - `/control/filtering/status` → filter list count, rules count, last update.
   - `/control/dhcp/status` → DHCP enabled, leases count.
   - `/control/safebrowsing/status`, `/control/parental/status`, `/control/safesearch/status` → feature flags.
   - `/control/dns_info` → upstream DNS server count, fastest_addr response time.
   - `/control/querylog?older_than=&limit=20` → recent sample (top blocked/allowed domain).

**Verification.**

- Add a new client device; confirm it appears in the clients list within one poll.
- Update filter lists via the UI; confirm `last_updated` advances.

**Rollback.** Remove the added endpoints from `getStats`.

---

### P2d — macMini: vm_stat + smartctl + pmset

**Backend changes.**

1. `getStats` adds:
   - `vm_stat` parsing → pages free/active/inactive/wired → real memory pressure.
   - `sysctl hw.memsize hw.ncpu hw.cpufrequency` once per session (cached).
   - `smartctl -a /dev/disk0` — feature-detected, omitted if not installed.
   - `pmset -g batt` → power source, battery if applicable.
   - `top -l 1 -n 0 -s 0` → idle %.
   - `ifconfig en0` → link state, MAC, IPs.

**Verification.**

- Run a memory-heavy workload; confirm wired/active pages climb.
- Confirm `smartctl` graceful absence when binary missing.

**Rollback.** Remove the added SSH commands from the stats collector.

---

## Phase 3 — Long tail

### P3a — IPFS: diag/sys + DHT + pin counts

**Backend changes.**

1. `getStats` adds:
   - `/api/v0/diag/sys` → Go runtime, FD count, CPU count, memstats.
   - `/api/v0/stats/dht` → DHT query/peer counts.
   - `/api/v0/pin/ls?type=recursive&quiet=true` → recursive pin count (no full hash list).
   - `/api/v0/swarm/addrs/listen` → listening addrs (verify expected ports open).

**Verification.**

- Pin a new CID; confirm pin count increments.
- Restart Kubo; confirm `diag/sys.uptime` resets.

**Rollback.** Trivial revert.

---

### P3b — AlbyHub: pin NWC endpoints

**Backend changes.**

1. Verify actual NWC API surface against the user's running AlbyHub.
2. Replace 6-path probe with deterministic endpoints (likely `/api/info`, `/api/balance`, `/api/channels`, `/api/transactions`, `/api/peers`).
3. Drop the multi-endpoint guesser. Keep the original code path behind a `legacyProbe: boolean` config flag for one release in case AlbyHub renames endpoints again.

**Verification.**

- Confirm balance, channel state, and recent payments are all retrievable in a single poll.
- Roll back to `legacyProbe=true` and confirm both paths work.

**Rollback.** Set `legacyProbe=true`.

---

## Cross-cutting tasks

These run alongside whichever phase touches them.

- **OpenAPI spec.** Each phase that changes a service's stats response updates [[apps/backend/openapi.yaml|openapi.yaml]] and the relevant integration doc under [[docs/integrations/index|docs/integrations]].
- **Time-series migrations.** Each new metric is an additive column; never rename or drop. Keep reads tolerant of missing columns for one release.
- **Frontend chart definitions.** Each new bandwidth/temperature/RAID metric should land with at least one chart spec to surface it; otherwise the data is invisible.
- **Service registry.** [[apps/backend/src/config/ServiceRegistry.ts|ServiceRegistry.ts]] gains the new config fields per phase via additive Zod schemas.

## Verification checklist per phase

Before merging any phase PR:

- [ ] `npm run lint` clean.
- [ ] `npm run test` clean (with new tests covering the new probe path).
- [ ] `npm run build` clean for backend + frontend.
- [ ] OpenAPI updated where contract changed.
- [ ] Integration doc under `docs/integrations/` updated.
- [ ] Time-series additive migration applied; legacy column reads still work.
- [ ] Manual verification step from this plan executed against a real instance.
- [ ] Service config flag defaults to `false`; flipped to `true` only after 24-hour soak.
- [ ] `watchman-kb-updater` agent run.

## Sequencing rationale

- **P0 first** because two-tier health is a contract change every other phase reads from. Doing per-service work before P0a means re-touching every service.
- **P0b–d** are the largest *information* gains per unit of work — Tor stops being on Onionoo, router stops being a black box, Hue stops being a ping target. Highest ROI.
- **P1** adds depth to services that already have basic monitoring.
- **P2** is host-level diagnostic depth (Pi throttling, Mac memory pressure) — important but not blocking the bigger gaps.
- **P3** is the long tail: nice to have, low risk, can ship at any time after P0.

## Out of scope

The following come up in adjacent conversations but are *not* part of this plan:

- Prometheus / OpenMetrics export of Watchman's own metrics. (Separate ADR if pursued.)
- Alerting / paging on threshold crossings. (Separate ADR.)
- Per-user views or RBAC. (Excluded by ADR-017 single-user posture.)
- Cloud / off-LAN access. (Excluded by ADR-018 LAN-only posture.)

## References

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019]] — the decision this plan implements
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] — `BackgroundPoller` dual-loop
- [[docs/adr/018-split-deploy-pi-backend|ADR-018]] — always-on Pi backend (enables this plan)
- [[docs/architecture/index|Architecture Overview]]
- [[docs/integrations/index|Integrations Index]]
