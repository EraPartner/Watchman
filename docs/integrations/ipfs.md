---
title: IPFS Integration
type: integration
status: active
date: 2026-05-08
tags: [integration, services, backend, monitoring, two-tier, icmp, http, metrics, extended-stats, dht, ndjson]
description: IPFS node integration with two-tier health model (ICMP + HTTP probe) and extended metrics (system diagnostics, DHT peers, pins, listen addresses)
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

## Service Class

`apps/backend/src/domain/services/ipfs/IpfsService.ts`

### Methods

- `checkHealth()` - IPFS API connection test
- `getStats()` - Node info, peer count, storage, system diagnostics, and DHT metrics
- `checkForUpdates()` - Check for IPFS updates

## Statistics Metrics

`getStats()` collects metrics from up to 9 IPFS API endpoints. 4 new optional endpoints (IP1 work) use graceful degradation — if they timeout or fail, the call returns default values without blocking the complete stats snapshot.

| Endpoint | Metric(s) | Notes |
| --- | --- | --- |
| `/api/v0/version` | `version` | IPFS version string |
| `/api/v0/id` | `nodeId`, `addressCount` | Node ID and multiaddr count |
| `/api/v0/swarm/peers?format=json` | `peers` | Connected peer count |
| `/api/v0/repo/stat?format=json` | `repoSize`, `numObjects` | Repository size in bytes, object count |
| `/api/v0/stats/bw?format=json` | `bwTotalIn`, `bwTotalOut`, `bwRateIn`, `bwRateOut` | Bandwidth totals and rates in bytes/sec |
| `/api/v0/diag/sys` (new) | `memAllocMb`, `goroutines`, `numCPU` | Memory allocation (rounded MB), goroutine count, CPU count. Optional, null on failure. |
| `/api/v0/stats/dht` (new) | `dhtPeers` | Sum of peer counts across all DHT routing table instances. Parses NDJSON (one JSON object per line). Defaults to 0 on failure. |
| `/api/v0/pin/ls?type=recursive` (new) | `pinnedCount` | Count of recursively pinned content hashes. Optional, null on failure. |
| `/api/v0/swarm/addrs/listen` (new) | `listenAddrCount` | Count of listen addresses (multiaddrs). Optional, null on failure. |

### Graceful Degradation

The 4 new endpoints use `.catch()` to handle timeouts or 500 errors without failing the entire `getStats()` call:
- `diagSys`, `pinLs`, `listenAddrs` return `null` on failure
- `dhtEntries` returns `[]` on failure
- Dependent metrics (`memAllocMb`, `goroutines`, `numCPU`, `pinnedCount`, `listenAddrCount`, `dhtPeers`) default appropriately

### DHT Parsing (NDJSON)

`/api/v0/stats/dht` returns newline-delimited JSON. The private method `postNdjson<T>()` parses it by splitting on newlines and extracting `PeerInfos.length` from each entry, summing to `dhtPeers`.

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
