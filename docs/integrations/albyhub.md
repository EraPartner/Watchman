---
title: Alby Hub Integration
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
    lightning,
    nwc,
    balances,
    channels,
    wallet,
  ]
description: Alby Hub Lightning wallet integration with two-tier health model, deterministic NWC API endpoints, and optional balance/channel metrics when a token is configured
aliases: [alby hub, lightning, bitcoin lightning, wallet, nwc]
---

# Alby Hub Integration

> [!abstract] Overview
> Monitors Alby Hub Lightning wallet with two-tier health model: ICMP ping to the host, plus HTTP probe to the Alby API. Supports both legacy adaptive probing and deterministic NWC API endpoints.

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to Alby Hub host
- **Service tier** — HTTP probe (adaptive or deterministic NWC)
- **Composite reachability** — `host.reachable AND service.reachable`

## Configuration

```bash
ALBYHUB_URL=http://127.0.0.1:8080
ALBYHUB_TOKEN=your-albyhub-token
ALBYHUB_TIMEOUT=10000           # optional, default 10s
ALBYHUB_LEGACY_PROBE=false      # optional, default false (deterministic NWC mode)
```

### `legacyProbe` Field

- **When `true`**: Uses adaptive probing to discover working endpoints. Tries multiple candidate paths (`/api`, `/api/info`, `/api/v1/info`, `/info`, `/status`, `/health`, `/`) until finding a reachable one; the last known-good path is cached and reused on subsequent polls (re-scan only when it stops answering). Backward-compatible with pre-NWC deployments.
- **When `false` (default since 2026-06-12)**: Uses deterministic NWC API endpoints (`/api/info` for health, `/api/info` + `/api/apps` for stats — 2 requests per cycle). Existing stored configs keep their persisted value.

## Stats Metrics

Stats are returned via `GET /services/albyHub/stats`. Metrics include:

### Common Fields (all modes)

| Metric      | Type   | Description                            |
| ----------- | ------ | -------------------------------------- |
| `name`      | string | Service name (e.g., "Alby Hub")        |
| `version`   | string | Software version or "unknown"          |
| `endpoint`  | string | API endpoint that responded            |
| `url`       | string | Full URL to the endpoint               |
| `reachable` | bool   | Whether service is currently reachable |

### NWC Mode Fields (`legacyProbe: false`)

Additional metrics available when using deterministic NWC endpoints:

| Metric           | Type           | Description                                                        |
| ---------------- | -------------- | ------------------------------------------------------------------ |
| `connected`      | bool \| null   | NWC connection status (from `/api/info`)                           |
| `setupCompleted` | bool \| null   | Whether wallet setup is complete                                   |
| `backendType`    | string \| null | Backend type (e.g., "lnd", "cln")                                  |
| `appCount`       | number \| null | Count of connected apps (from `/api/apps`); null if endpoint fails |

### Wallet and Channel Fields (NWC mode, token configured)

When a token is configured, `getStats()` additionally fetches `/api/balances` and `/api/channels`. These fields are **omitted entirely when no token is set**:

| Metric                           | Type           | Description                                                  |
| -------------------------------- | -------------- | ------------------------------------------------------------ |
| `balanceLightningSpendableMsat`  | number \| null | Spendable Lightning balance (millisatoshis)                  |
| `balanceLightningReceivableMsat` | number \| null | Receivable Lightning capacity (millisatoshis)                |
| `balanceOnchainSpendableSat`     | number \| null | Spendable on-chain balance (satoshis)                        |
| `balanceOnchainTotalSat`         | number \| null | Total on-chain balance (satoshis)                            |
| `channelCount`                   | number \| null | Total number of channels                                     |
| `channelsActive`                 | number \| null | Number of active (usable) channels                           |
| `channelLocalBalanceMsat`        | number \| null | Aggregate local balance across all channels (millisatoshis)  |
| `channelRemoteBalanceMsat`       | number \| null | Aggregate remote balance across all channels (millisatoshis) |

> [!info] Display note
> The frontend renderer displays millisatoshi values converted to satoshis in a **Wallet** detail group.

### Legacy Mode Fields (`legacyProbe: true`)

Metrics are minimal and endpoint-dependent:

| Metric        | Type   | Description                        |
| ------------- | ------ | ---------------------------------- |
| `description` | string | Service description (if available) |

## Service Class

`apps/backend/src/domain/services/albyHub/AlbyHubService.ts`

### Methods

- `checkHealth()` - Adaptive or deterministic health check
- `getStats()` - Wallet statistics and NWC info
- Private helpers: `probe()`, `resolveInfo()`, `checkHealthNwc()`, `getStatsNwc()`

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Implementation Details

### NWC Info Payload

When `legacyProbe: false`, the service fetches from `GET /api/info`:

```typescript
interface NwcInfo {
  backendType?: string; // Lightning backend type
  setupCompleted?: boolean; // Wallet setup status
  connected?: boolean; // Connection status
  version?: string; // Software version
  name?: string; // Service name
}
```

### NWC Apps Payload

Parallel fetch from `GET /api/apps` returns an array of app objects. The service counts the array length; if the endpoint returns a non-array or fails, `appCount` is set to `null`.

```typescript
interface NwcApp {
  id?: number;
  name?: string;
}
```

### Health Details Structure

Health snapshots include a `details` object:

**NWC mode:**

```
{
  endpoint: "/api/info",
  connected: boolean | null,
  version: string
}
```

**Legacy mode:**

```
{
  endpoint: "/{discovered-path}",
  statusCode: number
}
```

## Testing

The service includes 12 tests covering:

- Legacy probe mode (backward compatibility)
- NWC health checks (reachable + unreachable scenarios)
- NWC stats (full metrics, null appCount on failure)
- Bearer token forwarding

Test file: `apps/backend/src/domain/services/albyHub/AlbyHubService.test.ts`

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
- [[apps/backend/src/domain/services/albyHub/AlbyHubService.ts|AlbyHubService Implementation]]
- [[docs/integrations/bitcoin|Bitcoin Integration]]
