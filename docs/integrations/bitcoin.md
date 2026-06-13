---
title: Bitcoin Integration
type: integration
status: active
date: 2026-06-13
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
> Monitors a Bitcoin full node via RPC, optionally through Tor for privacy. Two-tier health model: ICMP ping to the host, plus RPC probe to `getblockchaininfo`.

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to Bitcoin node host
- **Service tier** — RPC `getblockchaininfo` probe
- **Composite reachability** — `reachable = service.reachable` — daemon-primary: the RPC/ZMQ probe defines health; the host/ICMP tier is retained for diagnostics only (see [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]])

If host is unreachable, service tier is skipped.

## Configuration

Configure via the Settings UI or `/config` API (DuckDB config store). Legacy `BITCOIN_*` environment variables are imported once on first boot then ignored (see [[docs/adr/015-config-store|ADR-015]]).

| Field                  | Type     | Required | Default                 | Secret | Description                                                            |
| ---------------------- | -------- | -------- | ----------------------- | ------ | ---------------------------------------------------------------------- |
| `instanceId`           | text     | yes      | `main`                  |        | Unique identifier for this instance                                    |
| `enabled`              | boolean  |          | `true`                  |        | Enable/disable polling                                                 |
| `rpcUrl`               | url      | yes      | `http://127.0.0.1:8332` |        | Bitcoin Core JSON-RPC endpoint (host + port)                           |
| `rpcUser`              | text     |          |                         |        | RPC username                                                           |
| `rpcPassword`          | password |          |                         | yes    | RPC password                                                           |
| `zmqHashblockEndpoint` | url      |          |                         |        | ZMQ endpoint for hashblock notifications, e.g. `tcp://127.0.0.1:28332` |
| `zmqRawtxEndpoint`     | url      |          |                         |        | ZMQ endpoint for rawtx notifications, e.g. `tcp://127.0.0.1:28333`     |
| `timeoutMs`            | number   |          | `5000`                  |        | Per-request timeout (ms)                                               |
| `cacheTtlMs`           | number   |          | `10000`                 |        | Stats cache TTL (ms)                                                   |

The ICMP ping target is derived from the hostname in `rpcUrl` — there is no separate host field.

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025).

| Endpoint                       | Description                |
| ------------------------------ | -------------------------- |
| `GET /services/bitcoin/health` | Health check               |
| `GET /services/bitcoin/stats`  | Block height, network info |

## Service Class

`[[apps/backend/src/domain/services/bitcoin/BitcoinService.ts|BitcoinService.ts]]`

### Health Check (`checkHealth()`)

Uses `withHostPing()` helper to run ICMP ping and RPC probe in parallel:

```ts
withHostPing(
  {
    host: this.pingHost,
    timeoutMs: this.timeoutMs,
    pingCount: 1,
    prober: this.pinger,
  },
  async (sig) => {
    const started = this.now();
    const [chainRaw, netRaw] = await this.rpcBatch(
      [{ method: "getblockchaininfo" }, { method: "getnetworkinfo" }],
      sig
    );
    return {
      reachable: Boolean(chainRaw?.chain),
      latencyMs: this.now() - started,
      details: { chain: chainRaw?.chain, version: resolveVersion(netRaw) },
    };
  },
  this.now(),
  signal
);
```

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
| `zmqRawtxEndpoint`     | `tcp://127.0.0.1:28333` (optional) |

### Real-Time Metrics

When `zmqHashblockEndpoint` is configured, `getStats()` exposes three additional metrics:

| Metric             | Type   | Description                                                   |
| ------------------ | ------ | ------------------------------------------------------------- |
| `zmqLastBlockHash` | string | Hex hash of the most-recent block via ZMQ (empty if none yet) |
| `zmqLastBlockAt`   | number | Epoch-ms timestamp of last `hashblock` event                  |
| `zmqBlockCount`    | number | Count of ZMQ `hashblock` events since service start           |

These appear in the stats JSON only when the endpoint is configured:

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
- ZMQ metrics are not populated
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
- `onStart()` also opens the ZMQ socket and subscribes to `['hashblock']`
- Message handler (`onMessage`) updates `lastBlockHashZmq`, `lastBlockAtZmq`, `zmqBlockCount`
- `onStop()` closes the ZMQ socket
- `getStats()` conditionally includes ZMQ metrics only when endpoint is configured

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` with `bitcoinRenderer` from the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/adr/020-two-tier-health-and-monitoring-upgrades|ADR-020 — ZMQ and Real-Time Metrics (BT2)]]
- [[docs/architecture/backend-architecture#zmq-subscriber-i6---real-time-zeromq-subscriptions|Backend Architecture — ZMQ Infra Primitive]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/integrations/tor|Tor Integration]]
- [[docs/api/services-health|Services Health API]]
