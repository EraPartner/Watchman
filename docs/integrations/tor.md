---
title: Tor Integration
type: integration
status: active
date: 2026-06-12
tags: [integration, services, backend, monitoring, control-port, phase-0b, task-b3, task-b4, task-b5, task-b6, task-b7, cookie-auth, event-subscription, bandwidth, traffic-deltas, onionoo-enrichment]
description: Tor relay and proxy integration for Watchman — ControlPort health checks, Onionoo API, two-tier health model (ICMP + protocol), cookie auth (B3), GETCONF/SIGNAL (B4), realtime BW events (B5), traffic deltas (B6), Onionoo enrichment (B7)
aliases: [tor, tor relay, onion, tor proxy, tor control port]
---

# Tor Integration

> [!abstract] Overview
> Monitors Tor relay status and manages the Tor proxy for other services (e.g., Bitcoin over Tor).

## Configuration

```bash
TOR_RELAY_NICKNAME=your-relay-nickname
TOR_RELAY_IP=your-ip-address
```

## Health Check Modes

Tor integration supports two distinct health-check methodologies via the `useControlPort` flag (Phase 0b+):

### Control Port Mode (useControlPort: true)

The **Tor Control Protocol** (RFC 5050) path probes circuit establishment directly:

- **Host tier** (ICMP): `ping` to the relay host with configurable count and timeout
- **Service tier** (protocol): TCP connection to ControlPort (default 9051), authentication, and `GETINFO status/circuit-established` check
- **Composite reachable**: `true` if either host OR service reachable (OR logic)
- **Latency**: ICMP ping time, fallback to elapsed time if ICMP unavailable

**Configuration** (Phase 0b+):

```bash
TOR_USE_CONTROL_PORT=true              # Enable ControlPort health checks
TOR_CONTROL_PORT=9051                  # ControlPort TCP listen port
TOR_CONTROL_PASSWORD=secret            # ControlPort auth: plaintext password or empty
TOR_CONTROL_COOKIE_AUTH_FILE=''        # Path to control auth cookie file (takes precedence over password)
TOR_CONTROL_TIMEOUT_MS=5000            # Connection + GETINFO timeout
TOR_PING_COUNT=3                       # ICMP probe count
```

**Authentication Priority** (Phase 0b+, task B3):

1. **Cookie Auth** (if `cookieAuthFile` is non-empty): Read binary cookie file, hex-encode it, send `AUTHENTICATE <hex>\r\n` (no quotes).
2. **Password Auth** (if password is non-empty): Send `AUTHENTICATE "<password>"\r\n` with quotes and escaping.
3. **No Auth** (if both empty): Send bare `AUTHENTICATE\r\n`.

This hierarchy allows secure deployment where the control auth cookie is stored at a configurable path (default: `/var/lib/tor/control_auth_cookie` when Tor is installed with `--enable-control-socket-is-world-writable=no`).

**Protocol Details** (Phase 0b+, Task B3/B4):

- TCP socket connection to `host:controlPort`
- AUTHENTICATE command (dispatched by auth priority above, Task B3):
  - Cookie: `AUTHENTICATE <64-char hex string>\r\n`
  - Password: `AUTHENTICATE "quoted_escaped_password"\r\n`
  - Empty: `AUTHENTICATE\r\n`
  - Success: `250 OK`
  - Failure: `515 Authentication failed` → `UnauthorizedError`
  - Other errors: `4xx/5xx` → `UnavailableError`
- GETINFO command (Task B4): `GETINFO key1 key2 ...\r\n`
  - Responses: `250-key=value` (single-line), `250+key=\r\ndata\r\n.\r\n` (multi-line), `250 ` (final)
  - Failure: `5xx` → `UnavailableError`
- GETCONF command (Task B4): `GETCONF key1 key2 ...\r\n`
  - Returns: `250-key=value` (configuration keys), `250 ` (final)
  - Parses and returns as `Map<string, string>`
- SIGNAL command (Task B4): `SIGNAL name\r\n`
  - Valid signals: `NEWNYM`, `SHUTDOWN`, `DUMP_STATS`, `DEBUG`, `SIGTERM`, `RELOAD`, `REOPEN_LOGS`, `CLEARDNSCACHE`
  - Response: `250 OK` or `5xx` error

**Circuit Established Check**:

- Sends: `GETINFO status/circuit-established`
- Returns: `status/circuit-established=1` (established) or `status/circuit-established=0` (not established)
- If connect fails during `probeCircuit()`, service is unreachable but host may still be reachable (depends on ICMP)

### Onionoo API Mode (useControlPort: false)

The legacy **Onionoo** HTTP API path queries Tor Project public consensus data:

- **Single HTTP endpoint**: `https://onionoo.torproject.org/`
- **Relay lookup**: Fetches relay metadata by nickname
- **Bandwidth and flags**: Reads `observed_bandwidth`, `running`, `hibernating` flags
- No host-level ICMP tier (reliance on external HTTP service)

### Off-LAN Fallback (Automatic)

When `useControlPort=true`, `TorService` automatically falls back to the Onionoo path when it detects the relay's network is unreachable. This lets a single config monitor a relay both from the LAN (rich, real-time) and away from it (Onionoo, ~1h stale but always reachable).

**Detection heuristic** (`checkHealthControlPort`):

- Run ICMP ping and ControlPort connect in parallel via `Promise.allSettled`.
- If **both** fail, mark the ControlPort "unreachable" and serve the Onionoo result for this poll.
- If ICMP succeeds but ControlPort fails, do **not** trigger fallback — surface as `service.reachable=false` (a real local Tor outage worth alerting on, not an off-LAN scenario).

**Sticky cooldown** (`CONTROL_PORT_FALLBACK_COOLDOWN_MS = 5 min`):

- Once both probes fail, subsequent `checkHealth` and `getStats` calls skip the ControlPort attempt entirely for 5 minutes and serve Onionoo data, so we don't pay a TCP timeout per poll while away.
- A successful ControlPort probe immediately clears the cooldown.
- After the cooldown expires, the next call retries ControlPort.

**Result markers**:

- ControlPort responses include `details.source = 'control-port'` and `details.controlPortReachable: boolean`.
- Fallback responses include `details.source = 'onionoo'` and `details.controlPortReachable: false`.
- ControlPort stats include `metrics.source = 'control-port'`; fallback stats include `metrics.source = 'onionoo'`.

**Tradeoff**: A few minutes of stale routing after returning to LAN (until the cooldown expires) — invisible in practice because Onionoo data is already ~1h stale.

## Stats (Metrics)

### Control Port Mode

Fetches detailed traffic and accounting metrics from the Tor daemon. Includes realtime bandwidth metrics from subscribed `BW` events (Phase 0b+, Task B5):

```
traffic/read           → bytes read from wire
traffic/written        → bytes written to wire
trafficDeltaRead       → bytes read since last poll (Task B6)
trafficDeltaWritten    → bytes written since last poll (Task B6)
version/current        → Tor version
dormant                → 1 if dormant, 0 if active
process/descriptor-limit → max open file descriptors

accounting/bytes       → total bytes in current accounting period
accounting/bytes-left  → bytes remaining in period

bwRead                 → realtime bytes read/sec from BW events (Phase 0b+, Task B5)
bwWritten              → realtime bytes written/sec from BW events (Phase 0b+, Task B5)

country                → relay country (from Onionoo enrichment, Task B7, optional)
consensusWeight        → relay consensus weight (from Onionoo enrichment, Task B7, optional)
asName                 → Autonomous System name (from Onionoo enrichment, Task B7, optional)
consensusWeightFraction → relay fractional consensus weight (from Onionoo enrichment, Task B7, optional)
```

**BW Event Subscription** (Task B5):

When `useControlPort=true`, `TorService.onStart()` creates an event subscription that:
- Subscribes to `BW` (bandwidth) events via `SETEVENTS BW`
- Parses `650 BW read=<bytes> written=<bytes>` async events
- Updates instance fields `bwRead` and `bwWritten` for inclusion in next stats poll
- Closes gracefully on `TorService.onStop()`

**Traffic Deltas** (Task B6):

To track network activity, the ControlPort path maintains cumulative traffic read/written from the daemon and computes delta values:
- Instance fields `lastTrafficRead` and `lastTrafficWritten` store the previous poll's cumulative byte counts (initialized to -1 as "no baseline" sentinel)
- On each `getStatsControlPort()` call, reads `traffic/read` and `traffic/written`, computes:
  - `trafficDeltaRead = traffic/read[current] - traffic/read[previous]` (bytes sent to wire since last poll)
  - `trafficDeltaWritten = traffic/written[current] - traffic/written[previous]` (bytes received from wire since last poll)
- First poll returns deltas of 0 because sentinel -1 means no baseline yet
- State (`lastTrafficRead`, `lastTrafficWritten`) is updated after each successful poll
- Metrics exposed: `trafficDeltaRead`, `trafficDeltaWritten` (both integers, bytes)

**Onionoo Supplemental Enrichment** (Task B7):

The ControlPort path is now the primary polling source. To supplement ControlPort metrics with Onionoo geolocation and consensus weight data:
- `getStatsControlPort()` calls private `enrich(signal)` method
- `enrich()` calls `searchRelay()` to fetch Onionoo relay data, **cached for 1 hour** — enrichment changes slowly, so the external Onionoo service is hit at most once per hour instead of every stats poll
- Returns best-effort subset: `{ country?, consensusWeight?, asName?, consensusWeightFraction? }`
- Errors are swallowed silently (non-fatal); on failure the last cached enrichment (if any) is served, otherwise ControlPort metrics are returned without enrichment
- Enrichment fields are conditionally spread into the metrics object — only present when Onionoo has them:
  - `country`: Onionoo's country code or country name (optional)
  - `consensusWeight`: Tor consensus weight (optional)
  - `asName`: Autonomous System name from Onionoo (optional, new field added to `OnionooRelay` interface)
  - `consensusWeightFraction`: Relay's fractional weight in the consensus (optional, new field added to `OnionooRelay` interface)
- The Onionoo path (ControlPort-less) remains unchanged, returning full Onionoo metrics

Returns `StatsResult::ok()` with metrics map or `err(UnavailableError)` on connect failure.

### Onionoo API Mode

Returns relay metadata from Onionoo:

```
observed_bandwidth     → bandwidth estimate (bytes/sec)
flags                  → relay flags (e.g., Guard, Exit, Fast, Stable)
running                → boolean
hibernating            → boolean
consensus_weight       → weight in network consensus
```

## Endpoints

| Endpoint                       | Description              | Auth              |
| ------------------------------ | ------------------------ | ----------------- |
| `GET /api/tor/status`          | Health check (2-tier)    | No (rate limited) |
| `GET /api/tor/stats`           | ControlPort or Onionoo   | Yes               |
| `GET /api/tor/health`          | Health alias             | No (rate limited) |
| `GET /api/tor/relay/:nickname` | Specific relay info      | Yes               |
| `GET /api/tor/updates`         | Check for updates        | Yes               |

## Service Classes

- `TorService` — Tor relay monitoring via ControlPort or Onionoo (`apps/backend/src/domain/services/tor/TorService.ts`)
  - Private fields (B5-B6):
    - `bwRead`, `bwWritten` — realtime bandwidth from BW event subscription (B5)
    - `lastTrafficRead`, `lastTrafficWritten` — previous poll cumulative bytes (B6, initialized to -1 sentinel)
  - Constructor: `TorDeps` includes `http`, `ping`, `torControl`, `config`, `now()`
  - `checkHealth()` dispatches on `useControlPort` flag → ControlPort or Onionoo path
  - `getStats()` dispatches on `useControlPort` flag → ControlPort or Onionoo path
  - `checkHealthControlPort()` — Promise.allSettled([ping, probeCircuit])
  - `probeCircuit()` — TCP ControlPort connect → GETINFO status/circuit-established
  - `getStatsControlPort()` — Reads traffic, version, accounting, dormant state; computes deltas (B6); calls `enrich()` for Onionoo supplemental metrics (B7)
  - `enrich()` — Private helper: best-effort Onionoo enrichment returning country, consensusWeight, asName, consensusWeightFraction; swallows errors (B7)
  - `searchRelay()` — Onionoo HTTP lookup (shared between Onionoo path and B7 enrichment)

- `TorManager` — Tor proxy management (`apps/backend/src/domain/services/tor/TorManager.ts`)

### TorService Methods (ControlPort Path, Phase 0b+ through Task B5)

**Lifecycle Methods** (Task B5):
- `onStart()` — Creates event subscription, subscribes to `BW` events, starts listening for bandwidth updates
- `onStop()` — Closes event subscription gracefully (sends `SETEVENTS` then `QUIT`)

**Health & Status Methods**:
- `checkHealth()` — Two-tier check: ICMP ping + ControlPort circuit probe; always returns `ok(HealthSnapshot)` with reachable state
- `getStats()` — Reads traffic, version, dormant, descriptor-limit, accounting metrics, and realtime bwRead/bwWritten from BW events via ControlPort; returns `ok(metrics)` or `err(UnavailableError)`
- `probeCircuit()` — Connects to ControlPort and queries `status/circuit-established`; returns boolean
- `checkHealthControlPort()` — Parallel ICMP + circuit check with `Promise.allSettled()`
- `getStatsControlPort()` — Nested try-catch for connect; GETINFO twice (core metrics, accounting); includes bwRead/bwWritten from event subscription
- `checkForUpdates()` — Check for Tor updates (legacy)

### TorManager Methods

- `initialize()` - Set up Tor proxy
- `startTor()` - Start Tor process
- `checkHealth()` - Verify proxy is running via SOCKS port probe
- `cleanup()` - Graceful shutdown; remove generated `torrc` while preserving Tor cache/state files

### Runtime Behavior

- Default Tor data directory is module-relative: `apps/backend/.tor-data` (see `TorManager`)
- Runtime root-level `.tor-data/` artifacts are ignored in git at repository root via [[.gitignore]]
- SOCKS readiness/health checks use a local TCP socket probe on `127.0.0.1:{port}` instead of shelling out to `lsof`
- Startup readiness polling uses backoff (`250ms` doubling up to `1000ms`) until timeout (`startupTimeout`)

### Test Coverage Notes

- `TorManager` colocated test covers lifecycle/error-path coverage:
  - `isInstalled()` fallback from `which tor` to Homebrew detection
  - `installTor()` success and failure paths
  - `startTor()` bootstrap log handling from stdout/stderr plus child-process `error` path
  - `cleanup()` warning-path behavior when success logger throws

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Implementation References

- **ControlClient**: [[apps/backend/src/infra/tor/controlClient.ts]] — TCP socket wrapper, async line-buffered reader, Tor control protocol parser, priority-based auth dispatch (cookie > password > empty), GETINFO/GETCONF/SIGNAL commands (Task B4)
- **EventSubscription** (Task B5): [[apps/backend/src/infra/tor/eventSubscription.ts]] — Persistent TCP socket, persistent event handler map, FIFO reply-waiter queue, `650` async event routing, `SETEVENTS`, `on(event, handler)`, clean shutdown with `closing`/`closed` flags
- **EventSubscriptionFactory** (Task B5): `createTorEventSubscriptionFactory()` factory function exported from eventSubscription.ts
- **TorService**: [[apps/backend/src/domain/services/tor/TorService.ts]] — Service class, health dispatch, stats aggregation, cookieAuthFile config field, `onStart()` / `onStop()` lifecycle with BW event subscription (Task B5), bwRead/bwWritten metrics; traffic delta tracking (Task B6: lastTrafficRead, lastTrafficWritten fields, delta computation in getStatsControlPort); Onionoo supplemental enrichment (Task B7: `enrich()` method, conditional spread of country/consensusWeight/asName/consensusWeightFraction into metrics)
- **OnionooRelay interface** (Task B7): Added `as_name?: string` and `consensus_weight_fraction?: number` fields to support Onionoo enrichment
- **Tests**: [[apps/backend/src/infra/tor/controlClient.test.ts]] — Fake TCP server pattern (shared net.Server, mutable serverHandler), cookie auth unit tests (hex encoding, success, 515 failure)
- **Tests**: [[apps/backend/src/domain/services/tor/TorService.test.ts]] — fakePing(), fakeTorControl(), ControlPort path tests with event subscription lifecycle, traffic delta assertions, Onionoo enrichment coverage

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/integrations/bitcoin|Bitcoin Integration]]
- [[docs/architecture/backend-architecture|Backend Architecture]] — infra layer (controlClient.ts)
- [[docs/testing/testing-strategy.md|Testing Strategy]] — Fake TCP server pattern
- [[docs/adr/019-two-tier-health-and-monitoring-upgrades.md|ADR-019]] — Two-Tier Health + Monitoring Upgrades
