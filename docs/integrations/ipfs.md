---
title: IPFS Integration
type: integration
status: active
date: 2026-06-12
tags:
  [
    integration,
    services,
    backend,
    monitoring,
    two-tier,
    icmp,
    http,
    metrics,
    extended-stats,
    dht,
    ndjson,
    bitswap,
    ttl-memo,
    post-only,
  ]
description: IPFS node integration with two-tier health model (ICMP + HTTP probe), extended metrics (system diagnostics, DHT peers, pins, listen addresses, Bitswap), POST-only RPC (Kubo >=0.5), and slow-lane ttlMemo for pin/dht/stats
aliases: [ipfs, interplanetary file system, ipfs node]
---

# IPFS Integration

> [!abstract] Overview
> Monitors an IPFS (InterPlanetary File System) node with two-tier health model: ICMP ping to the host, plus HTTP probe to the IPFS API.

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to IPFS node host
- **Service tier** — HTTP `GET /api/v0/id` probe
- **Composite reachability** — `host.reachable AND service.reachable`

## Configuration

```bash
IPFS_API_URL=http://127.0.0.1:5001
IPFS_TIMEOUT=10000  # optional, default 10s
```

## Endpoints

| Endpoint                | Description       | Auth                |
| ----------------------- | ----------------- | ------------------- |
| `GET /api/ipfs/status`  | Health check      | No (rate limited)   |
| `GET /api/ipfs/stats`   | Node statistics   | Yes                 |
| `GET /api/ipfs/updates` | Check for updates | Yes (auth required) |

## RPC Transport

All Kubo API calls are **POST-only** (Kubo ≥ 0.5 dropped GET support). The previous GET-with-405-fallback path and the `forcePost` config field have been removed. The service unconditionally uses `POST /api/v0/<method>`.

## Service Class

`apps/backend/src/domain/services/ipfs/IpfsService.ts`

### Methods

- `checkHealth()` - IPFS API connection test
- `getStats()` - Node info, peer count, storage, system diagnostics, DHT metrics, and Bitswap stats
- `checkForUpdates()` - Check for IPFS updates

## Statistics Metrics

`getStats()` collects metrics from multiple IPFS API endpoints. Optional endpoints use graceful degradation — if they timeout or fail, the call returns default values without blocking the complete stats snapshot.

| Endpoint                                   | Metric(s)                                                                                                                          | Notes                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v0/version`                          | `version`                                                                                                                          | IPFS version string                                                                                                                 |
| `/api/v0/id`                               | `nodeId`, `addressCount`                                                                                                           | Node ID and multiaddr count                                                                                                         |
| `/api/v0/swarm/peers?format=json`          | `peers`                                                                                                                            | Connected peer count                                                                                                                |
| `/api/v0/repo/stat?format=json`            | `repoSize`, `numObjects`                                                                                                           | Repository size in bytes, object count                                                                                              |
| `/api/v0/stats/bw?format=json`             | `bwTotalIn`, `bwTotalOut`, `bwRateIn`, `bwRateOut`                                                                                 | Bandwidth totals and rates in bytes/sec                                                                                             |
| `/api/v0/diag/sys`                         | `memAllocMb`, `goroutines`, `numCPU`                                                                                               | Memory allocation (rounded MB), goroutine count, CPU count. Optional, null on failure.                                              |
| `/api/v0/stats/dht`                        | `dhtPeers`                                                                                                                         | **Slow lane (10-min ttlMemo).** Sum of peer counts across all DHT routing table instances. Parses NDJSON. Defaults to 0 on failure. |
| `/api/v0/pin/ls?type=recursive&quiet=true` | `pinnedCount`                                                                                                                      | **Slow lane (10-min ttlMemo).** Count of recursively pinned content hashes. Optional, null on failure.                              |
| `/api/v0/swarm/addrs/listen`               | `listenAddrCount`                                                                                                                  | Count of listen addresses (multiaddrs). Optional, null on failure.                                                                  |
| `/api/v0/stats/bitswap`                    | `bitswapBlocksReceived`, `bitswapBlocksSent`, `bitswapDataReceived`, `bitswapDataSent`, `bitswapDupBlocks`, `bitswapWantlistCount` | Bitswap exchange metrics. Optional, null on failure.                                                                                |

### Slow-Lane Endpoints (ttlMemo)

`/api/v0/pin/ls` and `/api/v0/stats/dht` are expensive on large nodes. They ride a **10-minute slow lane** via `core/ttlMemo.ts` (see [[docs/reference/code-patterns#ttlmemo--slow-lane-memoization|Code Patterns — ttlMemo]]): the cached result is served for up to 10 minutes; a fresh fetch is only triggered after the TTL expires.

### Bitswap Metrics

`/api/v0/stats/bitswap` exposes data-exchange counters:

| Metric                  | Type   | Description                                  |
| ----------------------- | ------ | -------------------------------------------- |
| `bitswapBlocksReceived` | number | Total blocks received via Bitswap            |
| `bitswapBlocksSent`     | number | Total blocks sent via Bitswap                |
| `bitswapDataReceived`   | number | Total bytes received via Bitswap             |
| `bitswapDataSent`       | number | Total bytes sent via Bitswap                 |
| `bitswapDupBlocks`      | number | Duplicate blocks received (already had them) |
| `bitswapWantlistCount`  | number | Current number of entries in the wantlist    |

### Graceful Degradation

Optional endpoints use `.catch()` to handle timeouts or 500 errors without failing the entire `getStats()` call:

- `diagSys`, `pinLs`, `listenAddrs`, `bitswap` return `null` on failure
- `dhtEntries` returns `[]` on failure
- Dependent metrics default appropriately

### DHT Parsing (NDJSON)

`/api/v0/stats/dht` returns newline-delimited JSON. The private method `postNdjson<T>()` parses it by splitting on newlines and extracting `PeerInfos.length` from each entry, summing to `dhtPeers`.

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
- [[docs/reference/code-patterns#ttlmemo--slow-lane-memoization|Code Patterns — ttlMemo]]
- [[docs/performance/caching-strategies|Caching Strategies]]
