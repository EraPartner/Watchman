---
title: Service Monitoring Rollout Plan (ADR-020)
type: plan
status: proposed
date: 2026-05-07
tags: [plan, rollout, monitoring, services, adr-020, phases, refactor]
description: Phased implementation plan for ADR-020. Nine phases ordered by signal-quality gain per unit of effort, starting with the shared reachability helper and ending with optional push-channel integrations
aliases: [monitoring rollout, ADR-020 plan, service probe rollout]
---

# Service Monitoring Rollout Plan

> [!abstract] Purpose
> Concrete, phase-by-phase work breakdown to implement [[docs/adr/020-service-monitoring-methodology|ADR-020]]. Each phase is shippable independently and each phase improves observable signal quality.

## Phase ordering rationale

Phases are ordered by **(signal-quality gain) ÷ (effort + risk)** with three forcing functions:

1. Shared infra first — every later phase consumes the `ReachabilityProbe` helper, so it lands in Phase 0.
2. Zero-stats services next — Phase 1 unlocks visible new tiles for Hue/Router/Roon with low risk.
3. Highest-incorrectness service early — Tor's stale-Onionoo bug is the worst signal in the system; Phase 2.

## Phase summary

| # | Phase | Effort | Risk | Signal gain |
|---|-------|--------|------|-------------|
| 0 | Shared `ReachabilityProbe` helper + lift into all services | M | L | Uniform host-vs-service disambiguation across all 14 |
| 1 | Zero-stats wins (Hue config endpoint, Router SNMP v2c, Roon `/display`) | M | L | Three services gain real metrics |
| 2 | Tor control-port primary, Onionoo demoted to slow background | M | M | Local real-time relay health |
| 3 | Pi direct-SSH; drop Mac Mini bounce; drop rpi-cli requirement | M | M | Simpler, faster, fewer failure modes |
| 4 | Mac Mini sysctl/vm_stat rewrite + memory metrics | S | L | Robust parsing + new metrics |
| 5 | Synology RAID/Btrfs/SMART/UPS OIDs | S | L | Storage failure visibility |
| 6 | AlbyHub path-cache + NWC token integration | S | L | Lightning balance/channel metrics |
| 7 | Bitcoin extras (`getindexinfo`, `getpeerinfo`, `getblockstats`) | S | L | Sync %, peer churn, last-block fees |
| 8 | Misc additive metrics (qBittorrent trackers, AdGuard clients, Homebridge accessories, IPFS bitswap) | S | L | Round out per-service detail |
| 9 | **(Optional)** Push channels — Bitcoin ZMQ, Tor control async events, Hue v2 SSE | L | M | Push beats poll where free |

Effort: S ≤ ½ day, M ≤ 2 days, L > 2 days. Risk weighted by blast radius if buggy.

---

## Phase 0 — Shared `ReachabilityProbe`

### Goal

One reachability primitive injected into every `BaseService` subclass. Returns parallel ICMP + TCP results; per-service deep probe runs in parallel beside it.

### Files

| Action | Path |
|--------|------|
| Create | `apps/backend/src/infra/probe/ReachabilityProbe.ts` |
| Create | `apps/backend/src/infra/probe/ReachabilityProbe.test.ts` |
| Edit | `apps/backend/src/bootstrap/registerServices.ts` (DI wiring) |
| Edit | All `apps/backend/src/domain/services/*/` constructors that take separate `ping`/`tcp` deps → take single `reachability` |
| Edit | All `*Service.ts` `checkHealth()` to call `reachability.probe()` in parallel with deep probe |

### Contract

```ts
export interface ReachabilityRequest {
  host: string;
  port?: number;          // optional TCP probe target
  timeoutMs: number;
  pingCount: number;
  signal: AbortSignal;
}

export interface ReachabilityResult {
  icmp: { alive: boolean; rttMs?: number };
  tcp:  { open: boolean } | null;   // null when port not provided
  primaryAlive: boolean;             // icmp.alive || tcp.open
  rttMs?: number;                    // icmp.rttMs preferred
}

export interface ReachabilityProber {
  probe(req: ReachabilityRequest): Promise<ReachabilityResult>;
}
```

### Per-service `checkHealth` shape

```ts
async checkHealth(signal: AbortSignal): Promise<HealthResult> {
  const [reach, deep] = await Promise.all([
    this.reachability.probe({ host, port: primaryPort, ... }),
    this.deepProbe(signal),                                  // existing protocol probe
  ]);
  const reachable = deep.ok || (reach.tcp?.open && deep.degraded);
  return ok({
    reachable,
    latencyMs: reach.rttMs ?? deep.latencyMs,
    at: this.now(),
    details: { icmpAlive: reach.icmp.alive, tcpOpen: reach.tcp?.open ?? null, ...deep.details },
  });
}
```

### Acceptance

- All 14 services emit `icmpAlive` and `tcpOpen` (or `null`) in `details`.
- Frontend bento tiles show host vs service distinction (follow-up task — schema change is backwards-compatible until tile renderer reads the new keys).
- No regression in existing per-service tests.
- New unit tests for `ReachabilityProbe` cover: ICMP success, ICMP fail + TCP success (degraded mode), both fail, abort, port-omitted (ICMP-only).

### Out of scope

Frontend rendering of new fields. Schema/UI changes for new ports. Both follow in later phases when the data is actually different per-tile.

---

## Phase 1 — Zero-stats wins

Three services emit no real metrics today. Cheap fixes.

### 1a. Philips Hue — `/api/0/config`

`GET http://<host>/api/0/config` is **unauthenticated** and returns `bridgeid`, `modelid`, `swversion`, `apiversion`, `mac`, `name`. When `appKey` is configured (new optional schema field), additionally `GET /api/<appKey>/lights` for reachable count.

#### Files

| Action | Path |
|--------|------|
| Edit | `apps/backend/src/domain/services/philipsBridge/PhilipsBridgeService.ts` — replace stats stub |
| Edit | `apps/backend/src/config/services.ts` — add `appKey: z.string().default('')` to `PhilipsBridgeInstanceSchema` |
| Edit | `apps/backend/src/config/schemas/fieldMetadata.ts` — register new field for UI |
| Edit | `apps/backend/src/bootstrap/registerServices.ts` — inject `HttpClient` |
| Edit | `apps/backend/src/domain/services/philipsBridge/PhilipsBridgeService.test.ts` |
| Edit | `docs/integrations/philips-bridge.md` — document config + metric set |

### 1b. Router — SNMP v2c

Most home routers expose SNMP v2c (community string). Reuse [[apps/backend/src/infra/snmp/snmpGetterImpl.ts|snmpGetterImpl.ts]]; add v2c mode if missing.

OIDs:
- `1.3.6.1.2.1.1.3.0` — sysUpTime
- `1.3.6.1.2.1.2.2.1.10.<idx>` — ifInOctets per WAN interface
- `1.3.6.1.2.1.2.2.1.16.<idx>` — ifOutOctets per WAN interface
- `1.3.6.1.2.1.2.2.1.8.<idx>`  — ifOperStatus
- `1.3.6.1.2.1.2.2.1.5.<idx>`  — ifSpeed

Compute throughput as delta vs prior poll using existing in-process cache.

#### Files

| Action | Path |
|--------|------|
| Edit | `apps/backend/src/infra/snmp/snmpGetter.ts` — add v2c credential variant |
| Edit | `apps/backend/src/infra/snmp/snmpGetterImpl.ts` |
| Edit | `apps/backend/src/domain/services/router/RouterService.ts` — replace stub stats |
| Edit | `apps/backend/src/config/services.ts` — add `snmpEnabled`, `snmpCommunity`, `wanIfIndex` to `RouterInstanceSchema` |
| Edit | `apps/backend/src/bootstrap/registerServices.ts` — inject `SnmpGetter` |
| Edit | `apps/backend/src/domain/services/router/RouterService.test.ts` |
| Edit | `docs/integrations/router.md` |

### 1c. Roon — `/display` liveness

`GET http://<host>:9330/display` returns 200 when Roon Core is running with display extension. Fall back to current TCP probe if 404.

#### Files

| Action | Path |
|--------|------|
| Edit | `apps/backend/src/domain/services/roon/RoonService.ts` |
| Edit | `apps/backend/src/domain/services/roon/RoonService.test.ts` |

### Acceptance

- Hue tile shows version + light count.
- Router tile shows uptime + bytes-in/out + bps deltas.
- Roon tile shows TCP-port + display-API liveness as separate signals.
- All three services keep working when new fields are unset (backwards compat).

---

## Phase 2 — Tor control-port primary

### Goal

Local control-port becomes the source of truth for relay health. Onionoo demoted to a slow background poll for consensus weight + flags + country (refresh every 15 min, not every health tick).

### Files

| Action | Path |
|--------|------|
| Create | `apps/backend/src/infra/tor/torControlClient.ts` (TCP socket; `AUTHENTICATE`; `GETINFO`; safe-cookie auth + password auth) |
| Create | `apps/backend/src/infra/tor/torControlClient.test.ts` |
| Edit | `apps/backend/src/domain/services/tor/TorService.ts` |
| Edit | `apps/backend/src/domain/services/tor/TorService.test.ts` |
| Edit | `apps/backend/src/config/services.ts` — `TorInstanceSchema`: add `controlHost`, `controlPort` (default 9051), `controlPassword`, `cookieAuthPath`, `orPort` (default 9001), `metricsPort` (default 0 = disabled) |
| Edit | `apps/backend/src/config/schemas/fieldMetadata.ts` |
| Edit | `apps/backend/src/bootstrap/registerServices.ts` — wire control client |
| Edit | `docs/integrations/tor.md` — document `torrc` setup (`ControlPort 9051`, `CookieAuthentication 1` or `HashedControlPassword`) |

### Probes

`checkHealth`:
- TCP probe ORPort
- TCP probe ControlPort
- If ControlPort reachable: `AUTHENTICATE` + `GETINFO status/circuit-established` + `GETINFO status/version/current`

`getStats`:
- `GETINFO traffic/read`, `traffic/written`, `dormant`, `process/descriptor-limit`, `version`
- Optional MetricsPort scrape (when `metricsPort > 0`): parse Prometheus text for `tor_relay_load_onionskins_total`, `tor_relay_flag_total`, `tor_relay_connections_total`
- Onionoo data folded in from a separate slow-cadence poller (not in `getStats` critical path) — store in instance-local cache, read here

### Auth precedence

1. Cookie file (most common in default `torrc`): read `~/.tor/control_auth_cookie`, send `AUTHENTICATE <hex>`.
2. Password: send `AUTHENTICATE "<password>"`.
3. Neither: error with actionable message ("set ControlPort + CookieAuthentication or HashedControlPassword in torrc").

### Acceptance

- Killing the Tor process locally surfaces in the dashboard within one poll cycle.
- Onionoo outage does not affect health (verify by pointing `onionooBaseUrl` to invalid URL).
- Tests cover: control-port unreachable, auth fail, auth success + GETINFO, MetricsPort enabled vs disabled.

---

## Phase 3 — Pi direct-SSH

### Goal

Replace `Mac Mini → SSH → node → rpi-cli → pigpio-on-Pi` with `direct SSH → Pi reads /sys & /proc`. pigpio retained for hardware-revision probe and (future) GPIO state, not for stats.

### Files

| Action | Path |
|--------|------|
| Edit | `apps/backend/src/domain/services/raspberryPi/PiStatsCollector.ts` — direct SSH, parallel `cat /sys/class/thermal/thermal_zone0/temp`, `cat /proc/loadavg`, `cat /proc/uptime`, `cat /proc/meminfo`, `vcgencmd measure_volts core`, `vcgencmd get_throttled`, `vcgencmd measure_clock arm` |
| Edit | `apps/backend/src/domain/services/raspberryPi/PiStatsCollector.test.ts` |
| Edit | `apps/backend/src/domain/services/raspberryPi/PiHealthChecker.ts` — pigpio probe stays as one signal among many; stop treating its absence as fallback-only |
| Edit | `apps/backend/src/config/services.ts` — `RaspberryPiInstanceSchema`: add direct `sshUser`, `sshPort`, `sshKeyPath`, `sshPassphrase` (mirroring MacMini); deprecate `macMiniHost`/`macMiniSsh*`/`nodePath`/`rpiCliPath` (keep them readable for migration but mark optional, unused at runtime in new code path) |
| Edit | `apps/backend/src/config/store/migrations.ts` — migration that copies old bounce-mode fields to direct-mode if Pi was reachable from Mac Mini |
| Delete | `apps/backend/src/domain/services/raspberryPi/parseRpiInfo.ts` (rpi-cli output schema no longer needed). Keep file for now if migration tests need it; delete in cleanup pass. |
| Edit | `docs/integrations/raspberry-pi.md` |

### Parsing

- `/sys/class/thermal/thermal_zone0/temp` → integer millidegrees C → divide by 1000.
- `/proc/loadavg` → first three floats.
- `/proc/uptime` → first float in seconds.
- `/proc/meminfo` → grep `MemTotal`/`MemAvailable`/`SwapTotal`/`SwapFree` lines.
- `vcgencmd get_throttled` → hex bitmask; bit 0 = under-voltage now, bit 16 = under-voltage occurred since boot, etc.

All numeric, all stable. No fragile regex.

### Acceptance

- Pi stats work without Mac Mini configured.
- Throttle bitmask exposed as `throttledNow` / `throttledSinceBoot` booleans.
- Memory metrics present (currently absent).
- Migration: existing instances continue working; UI prompts to fill `sshUser`/`sshKeyPath` directly when those fields blank.

---

## Phase 4 — Mac Mini sysctl rewrite

### Goal

Drop regex parsing of `uptime`/`df`/`osx-cpu-temp`. Use structured `sysctl`, `vm_stat`, `system_profiler`, `df -k` (numeric columns only).

### Files

| Action | Path |
|--------|------|
| Edit | `apps/backend/src/domain/services/macMini/MacMiniService.ts` |
| Edit | `apps/backend/src/domain/services/macMini/MacMiniService.test.ts` |

### Commands

```bash
# uptime, load
sysctl -n kern.boottime           # → { sec = 1735612345, usec = 0 } Tue Dec 30 ...
sysctl -n vm.loadavg              # → { 1.23 0.98 0.87 }

# memory
vm_stat                           # parse "Pages free", "Pages active", "Pages wired down"
sysctl -n hw.memsize              # total bytes

# disk (already present, keep numeric column parse)
df -k /

# CPU temp (replace osx-cpu-temp dependency)
sudo powermetrics --samplers smc -i 1 -n 1 2>/dev/null   # ideal but needs sudo
ioreg -r -n AppleSMC | grep -i temperature                # alternative, no sudo

# hardware identity
system_profiler SPHardwareDataType -json
```

If `powermetrics` not allowed, fall back to `ioreg`. If neither parseable, omit `cpuTemp` (don't return zero).

### Acceptance

- Memory metrics present (`memTotal`, `memUsed`, `memAvailable`, `memUsagePercent`).
- Uptime numeric, computed from `kern.boottime`.
- No `osx-cpu-temp` dependency required.
- Tests stub each command output; failure of one command doesn't break the other metrics.

---

## Phase 5 — Synology storage health OIDs

### Goal

Surface RAID degradation, disk SMART warnings, Btrfs scrub state, UPS status. Currently silent.

### Files

| Action | Path |
|--------|------|
| Edit | `apps/backend/src/domain/services/synology/SynologyService.ts` — extend OID dictionary |
| Edit | `apps/backend/src/domain/services/synology/SynologyService.test.ts` |
| Edit | `docs/integrations/synology.md` |

### OIDs to add

| Metric | OID base | Note |
|--------|----------|------|
| RAID array status | `1.3.6.1.4.1.6574.3.1.1.3` | Walk per-array |
| Disk SMART status | `1.3.6.1.4.1.6574.2.1.1.7` | Walk per-disk |
| Disk model | `1.3.6.1.4.1.6574.2.1.1.2` | Walk per-disk |
| Disk temperature | `1.3.6.1.4.1.6574.2.1.1.6` | Walk per-disk |
| UPS battery charge | `1.3.6.1.4.1.6574.4.3.1.1.0` | Single |
| UPS status | `1.3.6.1.4.1.6574.4.2.1.0` | Single |
| Btrfs scrub state | `1.3.6.1.4.1.6574.101.1.1.5` | Walk per-volume |

### Acceptance

- Health goes degraded (`reachable: true`, warning set) when any disk reports non-OK SMART or RAID is not "Normal".
- Tile shows per-disk temps and SMART summary.
- Tests cover SMART-OK + SMART-warning + missing UPS (UPS OIDs gracefully absent).

---

## Phase 6 — AlbyHub path-cache + NWC stats

### Goal

Stop re-scanning 11 paths every poll. Cache the resolved info-path. Add Lightning metrics when an NWC token is configured.

### Files

| Action | Path |
|--------|------|
| Edit | `apps/backend/src/domain/services/albyHub/AlbyHubService.ts` — instance-field `cachedInfoPath`, set on first 2xx, invalidate on subsequent 4xx/5xx |
| Edit | `apps/backend/src/config/services.ts` — `AlbyHubInstanceSchema`: rename `token` to `nwcToken` (with migration), add `lightningEnabled` flag |
| Edit | `apps/backend/src/domain/services/albyHub/AlbyHubService.test.ts` |
| Edit | `docs/integrations/albyHub.md` |

### NWC stats (when `nwcToken` set)

Standard NWC info request returns: `node`, `methods`, `notifications`, `network`. Watchman additionally calls (where supported by remote):
- `get_balance` → channel balance
- `list_channels` → count + total inbound/outbound capacity
- `get_info` → block height, alias, color

### Acceptance

- Single round-trip per `getStats` instead of up to 11.
- Lightning metrics present when token configured; absent fields when not.
- Migration converts `token` → `nwcToken` for existing instances.

---

## Phase 7 — Bitcoin extras

### Goal

Add fee/sync/peer detail. RPC-only, no new infra.

### Files

| Action | Path |
|--------|------|
| Edit | `apps/backend/src/domain/services/bitcoin/BitcoinService.ts` |
| Edit | `apps/backend/src/domain/services/bitcoin/BitcoinService.test.ts` |

### New RPC calls in `getStats`

- `getindexinfo` → `txindex.synced`, `txindex.best_block_height`
- `getpeerinfo` → length + sum of `pingtime`
- `getblockstats <bestblockhash>` → `total_size`, `totalfee`, `feerate_percentiles`
- `estimatesmartfee 6` → next-block fee estimate

### Acceptance

- Tile shows sync %, peer count, last-block-fee, fee estimate.
- Calls run in parallel with existing four.
- Failure of any one extra is logged but does not fail the whole stats call.

---

## Phase 8 — Misc additive metrics

Round out per-service detail. Each is small.

| Service | Add |
|---------|-----|
| qBittorrent | `/api/v2/torrents/trackers` — count of working/failing trackers |
| AdGuard | `/control/clients` — active client count; `/control/dhcp/status` (when DHCP) |
| Homebridge | `/api/accessories` count; `/api/status/cpu`, `/api/status/ram` if exposed |
| IPFS | `/api/v0/stats/bitswap`, `/api/v0/diag/sys` |

### Acceptance

- One PR per service or one bundled PR (judgment call).
- Each new metric documented in the relevant `docs/integrations/*.md`.
- All optional — services keep working if new endpoints 404.

---

## Phase 9 — (Optional) Push channels

Out of scope for the initial ADR-020 rollout. Tracked here for completeness so the rollout can extend without revisiting the design.

| Service | Push channel | New infra |
|---------|--------------|-----------|
| Bitcoin | ZMQ `tcp://node:28332` topics `hashblock`, `rawtx` | `infra/zmq/zmqSubscriber.ts` (use `zeromq` package) |
| Tor | Control-port `SETEVENTS BW NS NEWCONSENSUS` | Extend `torControlClient` to async-event mode + emit on event bus |
| Hue | v2 SSE `/eventstream/clip/v2` | `infra/sse/sseClient.ts` |

### Gating

Each per-instance schema field: `pushEnabled: boolean = false`. Push subscription starts on `onStart()`, ends on `onStop()`. Falls back to poll loop if subscription drops twice within five minutes.

### Acceptance criteria deferred

To be defined when Phase 9 is scheduled. Likely: end-to-end test that publishes a synthetic ZMQ event to a fixture node and asserts the in-process eventBus emits a corresponding `service.update`.

---

## Cross-phase concerns

### Test coverage

Each service touched gets:
- One unit test per new metric.
- One integration test for the new probe path (mock at the network/SSH/SNMP boundary).
- One test for the degraded mode (deep probe fails but TCP open → `reachable: true` with warning).

Coverage target unchanged from project default (80%).

### Migration

Each schema-changing phase ships a no-op migration that:
1. Reads old field shape from ConfigStore.
2. Writes new field shape with sensible defaults.
3. Logs a one-line warning when the old shape is detected so the operator knows to verify the UI.

No breaking changes mid-rollout — every phase ships independently and a rollback to the prior phase is safe (the new fields are additive).

### OpenAPI & docs

Per-service `details` and `metrics` keys are documented in `apps/backend/openapi.yaml` under the respective service schemas and in `docs/integrations/*.md`. New keys land in the same PR as the code change. The KB updater agent runs after each phase per project policy.

### Frontend impact

`details` and `metrics` are rendered by the bento `ServiceTile` registry per [[docs/components/bento-dashboard|Bento Dashboard]]. New keys appear in the JSON envelope automatically; tile renderers are updated phase-by-phase to surface new fields. Default behavior: unrecognized keys appear in the "Raw" tab of the detail sheet.

### Rollback plan

Every phase is a stand-alone PR on a feature branch; main is always green. Rolling back a phase is `git revert` + redeploy. No persistent state changes to roll back (post-ADR-019 there is no time-series store).

## Success criteria for the full rollout

1. All 14 services emit `icmpAlive` and `tcpOpen` (or `null`) on every `checkHealth`.
2. Tor health reflects local relay process state with ≤ 1 poll cycle of lag.
3. Pi works without Mac Mini.
4. Mac Mini metrics include memory; uptime is numeric.
5. Synology surfaces RAID/disk/UPS warnings.
6. Hue, Router, Roon emit non-trivial stats.
7. AlbyHub does one HTTP round-trip per stats call instead of up to 11.
8. Bitcoin tile shows sync %, peer count, last-block fee.
9. No service depends on an external HTTP API for primary health.

## References

- [[docs/adr/020-service-monitoring-methodology|ADR-020]] — the decision this plan implements.
- [[docs/adr/013-backend-rewrite-typescript-fastify|ADR-013]] — BaseService contract.
- [[docs/adr/015-ui-driven-service-configuration|ADR-015]] — how schema changes flow into the UI.
- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] — threat model for SNMP v2c choice.
- [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]] — single-host deployment model.
- Code: `[[apps/backend/src/domain/BaseService.ts]]`, `[[apps/backend/src/infra/net/pingProbe.ts]]`, `[[apps/backend/src/infra/net/tcpProbe.ts]]`, `[[apps/backend/src/infra/snmp/snmpGetterImpl.ts]]`.
