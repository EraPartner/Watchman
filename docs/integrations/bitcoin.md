---
title: Bitcoin Integration
type: integration
status: active
date: 2026-10-28
tags:
  [
    integration,
    services,
    backend,
    monitoring,
    two-tier,
    icmp,
    rpc,
    bt1,
    bt2,
    zmq,
    real-time,
    batched-rpc,
    fee-estimates,
  ]
description: Bitcoin full node integration with two-tier health model (ICMP + RPC probe), batched JSON-RPC stats, fee-rate estimates (sat/vB), and optional ZMQ real-time block streaming (BT2)
aliases: [bitcoin, btc, bitcoin node, rpc, zmq]
---

# Bitcoin Integration

> [!abstract] Overview
> Monitors a Bitcoin full node via JSON-RPC. Two-tier health model: ICMP ping to the host, plus a batched RPC probe (`getblockchaininfo` + `getnetworkinfo`).

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to Bitcoin node host
- **Service tier** — one batched JSON-RPC request with `getblockchaininfo` and `getnetworkinfo`
- **Composite reachability** — `reachable = service.reachable` — daemon-primary: the RPC probe defines health (ZMQ is not part of health); the host/ICMP tier is retained for diagnostics only (see [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]])

`withHostPing` runs the ping and the RPC probe in parallel, so neither tier skips the other. Because reachability follows the service tier, a failed ping with a responding RPC still reports the node as reachable; a failed RPC probe reports it unreachable whatever the ping says.

## Configuration

Configure via the Settings UI or `/config` API (DuckDB config store). Legacy `BITCOIN_*` environment variables are imported once on first boot then ignored (see [[docs/adr/015-ui-driven-service-configuration|ADR-015]]).

| Field                  | Type     | Required | Default                 | Secret | Description                                                            |
| ---------------------- | -------- | -------- | ----------------------- | ------ | ---------------------------------------------------------------------- |
| `instanceId`           | text     | yes      | `main`                  |        | Unique identifier for this instance                                    |
| `enabled`              | boolean  |          | `true`                  |        | Enable/disable polling                                                 |
| `rpcUrl`               | url      | yes      | `http://127.0.0.1:8332` |        | Bitcoin Core JSON-RPC endpoint (host + port)                           |
| `rpcUser`              | text     |          |                         |        | RPC username. Required in practice: without RPC credentials health and stats both fail |
| `rpcPassword`          | password |          |                         | yes    | RPC password                                                           |
| `zmqHashblockEndpoint` | url      |          |                         |        | ZMQ endpoint for hashblock notifications, e.g. `tcp://127.0.0.1:28332` |
| `zmqRawtxEndpoint`     | url      |          |                         |        | ZMQ endpoint for rawtx notifications, e.g. `tcp://127.0.0.1:28333` (counted as `zmqTxCount`) |
| `timeoutMs`            | number   |          | `5000`                  |        | Per-request timeout (ms)                                               |
| `cacheTtlMs`           | number   |          | `10000`                 |        | Stats cache TTL (ms)                                                   |

The ICMP ping target is derived from the hostname in `rpcUrl` — there is no separate host field.

> [!warning] Cookie auth is not supported
> Watchman sends HTTP Basic auth from `rpcUser` / `rpcPassword` only. It cannot read Bitcoin
> Core's `.cookie` file. Set `rpcauth=` (or `rpcuser=` / `rpcpassword=`) in `bitcoin.conf` and
> enter the same user and password here. Without both of them, every RPC call throws
> `UnauthorizedError` ("bitcoin rpc credentials not configured") before any request is sent, so
> health reports the node as unreachable and stats are unavailable (field help in `apps/backend/src/config/schemas/fieldMetadata.ts`). Watchman only calls read
> RPCs (listed under Stats below).

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025).

| Endpoint                       | Description                |
| ------------------------------ | -------------------------- |
| `GET /services/bitcoin/health` | Health check               |
| `GET /services/bitcoin/stats`  | Block height, network info |

## Service Class

`[[apps/backend/src/domain/services/bitcoin/BitcoinService.ts|BitcoinService.ts]]`

### Health Check (`checkHealth()`)

Uses `withHostPing()` to run the ICMP ping and the RPC probe in parallel. The probe sends one
batched JSON-RPC request (`getblockchaininfo` + `getnetworkinfo`) through `rpcBatch()`, which
returns `{ results, errors }`: a per-call RPC error yields `null` at that position plus the node's
message in `errors`, while transport and auth failures (missing credentials, `401`, `403` from
`rpcwhitelist`, other non-2xx) throw.

- **Healthy** — `getblockchaininfo` returned a `chain`: `reachable: true` with `details.chain`,
  `details.version` (from `getnetworkinfo`) and `details.blocks`.
- **Responding but incomplete** — no `chain` (for example `-28 Loading block index…` while the node
  warms up): `reachable: false`, `message: "bitcoin rpc: <reason>"` when the node gave one, and
  `details.warning: "bitcoin responding but data incomplete"`.
- **Thrown error** — `withHostPing` records the service tier as unreachable with the error message.

Returns `HealthSnapshot` with `host` and `service` tiers.

### Stats (`getStats()`)

All stats are collected via **one batched JSON-RPC HTTP request** per poll cycle. The batch contains:

`getblockchaininfo`, `getnetworkinfo`, `getmempoolinfo`, `uptime`, `getnettotals`, `getmininginfo`, `getindexinfo`, `estimatesmartfee` (targets 1, 6, and 144 blocks).

Core metrics (always available):

- Block height, difficulty, network info, mempool data, uptime

Extended stats **(BT1 — Bitcoin Extended Stats)**:

- **Peer Count** — Number of connected peers (from `getnetworkinfo.connections`; `getpeerinfo` is no longer called)
- **Total Bytes Received** — Cumulative bytes received by node (from `getnettotals`)
- **Total Bytes Sent** — Cumulative bytes sent by node (from `getnettotals`)
- **Hashes Per Second** — Network hash rate (from `getmininginfo`)
- **TX Index Synced** — Whether transaction index is fully synced (from `getindexinfo`)
- **TX Index Height** — Best block height in transaction index (from `getindexinfo`)

**Fee-Rate Estimates (sat/vB)**:

| Metric           | Target         | Source                 |
| ---------------- | -------------- | ---------------------- |
| `feeSatPerVb1`   | Next block (1) | `estimatesmartfee 1`   |
| `feeSatPerVb6`   | ~1 hour (6)    | `estimatesmartfee 6`   |
| `feeSatPerVb144` | ~1 day (144)   | `estimatesmartfee 144` |

Each value is converted from Bitcoin Core's BTC/kvB to sat/vB and is `null` when the node has insufficient mempool history to produce an estimate.

All BT1 metrics are optional and graceful — if a Bitcoin node is older and doesn't support these RPCs, they default to safe zero/false values. No probe dependency; cached data on timeout.

## Real-Time Block Monitoring (BT2 — ZMQ Subscription)

> [!info] ZMQ Block and Transaction Streaming
> When Bitcoin Core is configured with ZMQ endpoints (typically `tcp://127.0.0.1:28332` for blocks and `tcp://127.0.0.1:28333` for transactions), Watchman optionally subscribes to these streams for real-time block notification, reducing latency between actual blockchain events and displayed metrics.

> [!note] Wired since 2026-06-12
> The ZMQ subscriber (`infra/zmq/zmqSubscriberImpl`) is now passed through `bootstrap/registerServices.ts` into `BitcoinService` — previously the module existed but was never connected, so `zmqHashblockEndpoint` had no effect. ZMQ connection failures remain non-fatal (poll-only mode).

### Configuration

Enable ZMQ subscription by configuring Bitcoin Core and setting the Watchman fields via the Settings UI or `/config` API:

```ini
# Bitcoin Core bitcoin.conf
zmqpubhashblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333
```

Then set the corresponding Watchman config fields:

| Field                  | Value                              |
| ---------------------- | ---------------------------------- |
| `zmqHashblockEndpoint` | `tcp://127.0.0.1:28332`            |
| `zmqRawtxEndpoint`     | leave empty (not used yet)         |

### Real-Time Metrics

When `zmqHashblockEndpoint` is configured, `getStats()` exposes these additional metrics:

| Metric             | Type   | Description                                                   |
| ------------------ | ------ | ------------------------------------------------------------- |
| `zmqLastBlockHash` | string | Hex hash of the most-recent block via ZMQ (empty if none yet) |
| `zmqLastBlockAt`   | number | Epoch-ms timestamp of last `hashblock` event                  |
| `zmqBlockCount`    | number | Count of ZMQ `hashblock` events since service start           |
| `zmqConnected`     | boolean | Whether the ZMQ subscription is running                      |
| `zmqError`         | string \| null | Why the subscription failed to start (null when connected) |

When `zmqRawtxEndpoint` is configured, Watchman also subscribes to the `rawtx` topic. Each
transaction notification is only counted; the transaction itself is not decoded or stored.

| Metric              | Type           | Description                                                                         |
| ------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `zmqTxCount`        | number \| null | Count of ZMQ `rawtx` events since service start; always present, `null` when `zmqRawtxEndpoint` is unset |
| `zmqRawtxConnected` | boolean        | Whether the rawtx subscription is running (present only when `zmqRawtxEndpoint` is set) |
| `zmqRawtxError`     | string \| null | Why the rawtx subscription failed to start (present only when `zmqRawtxEndpoint` is set) |

When `zmqHashblockEndpoint` and `zmqRawtxEndpoint` are the same endpoint, Watchman opens one socket
subscribed to both topics, so `zmqConnected`/`zmqError` and `zmqRawtxConnected`/`zmqRawtxError`
report the same connection. Different endpoints get one socket each and fail independently. The
detail sheet shows `zmqBlockCount` and `zmqTxCount` in its ZMQ group (`—` when the count is `null`).

The hashblock metrics appear in the stats JSON only when `zmqHashblockEndpoint` is configured:

```json
{
  "metrics": {
    "blocks": 850000,
    "zmqLastBlockHash": "0000000000000000000cd65cc...",
    "zmqLastBlockAt": 1715180234567,
    "zmqBlockCount": 42
  }
}
```

### Graceful Degradation

ZMQ connection failure in `onStart()` is **non-fatal**:

- Service continues polling via RPC (`getblockchaininfo`)
- `zmqConnected` is `false` and `zmqError` says why (for example `zeromq` not installed, or a malformed endpoint); the other ZMQ metrics stay at their empty values; a failed rawtx subscription is reported the same way through `zmqRawtxConnected` / `zmqRawtxError`
- No error is raised; fallback to poll-only mode
- Suitable for environments where ZMQ is not available or misconfigured

**Behavior:**

- ✅ Endpoint configured and reachable → Real-time metrics available
- ⚠️ Endpoint misconfigured or unreachable → Falls back to poll-only (30s default interval)
- ✅ Endpoint later restored → Next `onStart()` reconnects

### Implementation

[[apps/backend/src/domain/services/bitcoin/BitcoinService.ts|BitcoinService.ts]]:

- Constructor accepts optional `zmqConnect?: ZmqConnectFn` dependency
- `onStart()` calls `getzmqnotifications` via the batched RPC path and surfaces two additional stats fields when a ZMQ endpoint is configured:
  - `zmqEndpointMatch` — `true` when the configured `zmqHashblockEndpoint` port matches a port reported by `getzmqnotifications`
  - `zmqServerHashblockEndpoint` — the raw endpoint string returned by Bitcoin Core for the `pubhashblock` notification type (e.g. `tcp://127.0.0.1:28332`)
- `onStart()` groups the configured topics by endpoint and opens one ZMQ socket per endpoint (`hashblock`, `rawtx`, or both on a shared endpoint); the `getzmqnotifications` check runs only when `zmqHashblockEndpoint` is set
- Message handler (`onMessage`) updates `lastBlockHashZmq`, `lastBlockAtZmq`, `zmqBlockCount` for `hashblock`, and increments `zmqTxCount` for `rawtx`
- `onStop()` closes each socket once (a shared socket is closed once)
- `getStats()` includes the hashblock metrics only when `zmqHashblockEndpoint` is configured, and `zmqRawtxConnected`/`zmqRawtxError` only when `zmqRawtxEndpoint` is configured

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` with `bitcoinRenderer` from the renderer registry.

## Related

- [[docs/guides/service-setup/bitcoin|Setup guide]]: what to enable on the service, least-privilege credentials, and how to add it in Watchman
- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 — Two-Tier Health + Monitoring Upgrades]]
- [[docs/architecture/backend-architecture#zmq-subscriber-i6---real-time-zeromq-subscriptions|Backend Architecture — ZMQ Infra Primitive]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/integrations/tor|Tor Integration]]
- [[docs/api/services-health|Services Health API]]
