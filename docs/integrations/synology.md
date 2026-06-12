---
title: Synology Integration
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
    snmp,
    dsm-api,
    extended-stats,
    utilization,
    multi-volume,
    dsm-only-mode,
  ]
description: Synology NAS integration with dual SNMP + DSM API, two-tier health model, multi-instance support, DSM SYNO.Core.System.Utilization metrics, multi-volume disk totals, and DSM-only stats mode when SNMP creds are absent
aliases: [synology, nas, synology nas, dsm, synology dsm]
---

# Synology Integration

> [!abstract] Overview
> Monitors Synology NAS devices with two-tier health model (ICMP + SNMP probe) and multi-instance support.

## Infrastructure: DSM Client (SY1)

[[apps/backend/src/infra/synology/dsmClient.ts|dsmClient.ts]] — Purpose-built Synology DSM session client (`createDsmClient(deps: DsmClientDeps): DsmClient`).

### Key Behaviours

- **Routing**: `SYNO.API.Auth` calls → `/webapi/auth.cgi`; all other API calls → `/webapi/entry.cgi`
- **Session injection**: Sends `_sid=<sid>` (and all other params, including `passwd` at login) in a POST form body — never in the URL, which proxies/APM tooling routinely log
- **Auto-login**: Performs login automatically on first call when no `initialSid` configured
- **Session recovery**: On DSM error codes 105/106/107 (session expired/not found/user not found):
  - Re-logs in once
  - Retries the original call
  - Throws `UnavailableError` if retry also fails
- **Other errors**: DSM error codes → `UnavailableError`; missing credentials → `UnauthorizedError`
- **Concurrency**: Concurrent calls share a single pending login (thundering herd prevention via `pendingLogin: Promise<string> | null` pattern)
- **Test coverage**: 12 tests covering all branches including concurrent access

### API

```typescript
interface DsmClientConfig {
  baseUrl: string;
  account: string;
  password: string;
  timeoutMs: number;
  initialSid?: string; // Pre-existing session ID; omit to login on first call
}

interface DsmClientDeps {
  http: HttpClient;
  config: DsmClientConfig;
}

interface DsmClient {
  call<T>(
    api: string,
    version: number,
    method: string,
    params?: Record<string, string>,
    signal?: AbortSignal
  ): Promise<T>;
}
```

### Status

**SY1** — Complete (12 tests passing).

## Service Integration: DSM Stats (SY2)

[[apps/backend/src/domain/services/synology/SynologyService.ts|SynologyService.ts]] — Enhanced `getStats()` method now queries DSM API for extended telemetry.

### Dual SNMP + DSM Approach

- **SNMP**: Core metrics (CPU, memory, disk, network) — **required**
- **DSM API**: Extended telemetry (system status, fan/power state, storage health) — **optional**
- **Concurrency**: Both SNMP and all DSM calls run in parallel via `Promise.allSettled`
- **Graceful degradation**: If DSM calls fail, SNMP metrics still returned; missing DSM fields omitted from response

### Network Counters

- `networkRx`/`networkTx` prefer the 64-bit ifXTable HC counters (`1.3.6.1.2.1.31.1.1.1.6.1` / `.10.1`, ifIndex=1) fetched in a separate SNMP get; the 32-bit `1.3.6.1.2.1.2.2.1.10.1`/`.16.1` values are a fallback when ifXTable is unavailable (32-bit counters wrap at 4 GiB).
- `networkRxBps`/`networkTxBps` are byte rates derived from counter deltas between polls; omitted on the first poll and when a counter decreases (wrap/reboot).

### DSM API Calls

| API                        | Method      | Field Keys                                                             |
| -------------------------- | ----------- | ---------------------------------------------------------------------- |
| `SYNO.DSM.Info`            | `get`       | `dsmModel`, `dsmVersion`, `dsmTemperature`                             |
| `SYNO.Core.System.Status`  | `get`       | `cpuFanStatus`, `sysFanStatus`, `powerStatus`                          |
| `SYNO.Storage.CGI.Storage` | `load_info` | `volumeCount`, `volumeDegradedCount`, `diskCount`, `diskDegradedCount` |

All new fields are **optional** in the stats response and included only when DSM is configured and calls succeed.

### Configuration

DSM metrics are enabled when **all three** of these are non-empty:

```bash
SYNOLOGY_DSM_URL=https://nas.local:5001
SYNOLOGY_DSM_ACCOUNT=your-username
SYNOLOGY_DSM_PASSWORD=your-password
```

If any are empty/missing, DSM calls are skipped; SNMP-only metrics are returned.

### Test Coverage

- **DSM happy path**: Parallel SNMP + DSM calls merged correctly
- **DSM graceful degradation**: DSM exception → SNMP metrics still returned
- **SNMP-only**: No DSM config → SNMP metrics without DSM fields

**Status**: **SY2** — Complete (3 new tests + existing SNMP tests).

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to NAS host
- **Service tier** — SNMP `sysUpTime` probe
- **Composite reachability** — `host.reachable AND service.reachable`

## Configuration

### Single Instance

```bash
# SNMP (required)
SYNOLOGY_HOST=192.0.2.100
SYNOLOGY_SNMP_USER=your-snmp-user
SYNOLOGY_SNMP_AUTH_KEY=your-auth-key
SYNOLOGY_SNMP_PRIV_KEY=your-priv-key
SYNOLOGY_SNMP_AUTH_PROTOCOL=SHA  # optional: SHA or MD5
SYNOLOGY_SNMP_PRIV_PROTOCOL=AES  # optional: AES or DES
SYNOLOGY_TIMEOUT=10000  # optional, default 10s

# DSM API (optional; all three required to enable)
SYNOLOGY_DSM_URL=https://nas.local:5001
SYNOLOGY_DSM_ACCOUNT=your-username
SYNOLOGY_DSM_PASSWORD=your-password
```

### Multi-Instance

```bash
# Instance 1
SYNOLOGY_1_HOST=192.0.2.100
SYNOLOGY_1_SNMP_USER=snmp-user
SYNOLOGY_1_SNMP_AUTH_KEY=auth-key
SYNOLOGY_1_SNMP_PRIV_KEY=priv-key
SYNOLOGY_1_DSM_URL=https://nas1.local:5001
SYNOLOGY_1_DSM_ACCOUNT=admin
SYNOLOGY_1_DSM_PASSWORD=password

# Instance 2
SYNOLOGY_2_HOST=192.0.2.101
SYNOLOGY_2_SNMP_USER=snmp-user
SYNOLOGY_2_SNMP_AUTH_KEY=auth-key
SYNOLOGY_2_SNMP_PRIV_KEY=priv-key
SYNOLOGY_2_DSM_URL=https://nas2.local:5001
SYNOLOGY_2_DSM_ACCOUNT=admin
SYNOLOGY_2_DSM_PASSWORD=password
```

## Endpoints

| Endpoint                   | Description                | Auth              |
| -------------------------- | -------------------------- | ----------------- |
| `GET /api/synology/status` | Health check               | No (rate limited) |
| `GET /api/synology/stats`  | System stats, storage info | Yes               |

## Service Class

[[apps/backend/src/domain/services/synology/SynologyService.ts|SynologyService.ts]]

### Methods

- `checkHealth()` — Two-tier ICMP + SNMP probe
- `getStats()` — SNMP metrics + optional DSM extended stats (parallel, graceful degradation)

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` with `synologyRenderer` from the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/features/multi-instance|Multi-Instance Support]]
- [[docs/api/services-health|Services Health API]]
