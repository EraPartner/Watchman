---
title: Synology Integration
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

DSM metrics are enabled when **all three** of the DSM fields are non-empty in the instance config: `dsmUrl`, `dsmAccount`, and `dsmPassword`. Configure them via the Settings UI or the `/config` API (see [[#Configuration]] below). If any are empty/missing, DSM calls are skipped; SNMP-only metrics are returned.

### Test Coverage

- **DSM happy path**: Parallel SNMP + DSM calls merged correctly
- **DSM graceful degradation**: DSM exception → SNMP metrics still returned
- **SNMP-only**: No DSM config → SNMP metrics without DSM fields

**Status**: **SY2** — Complete (3 new tests + existing SNMP tests).

## Health Model (Phase 0a)

Two-tier health via `withHostPing` helper:

- **Host tier** — ICMP ping to NAS host
- **Service tier** — SNMP `sysUpTime` probe
- **Composite reachability** — `reachable = service.reachable` — daemon-primary: the SNMP/DSM probe defines health; the host/ICMP tier is retained for diagnostics only (see [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]])

## Configuration

Service instances are configured via the Settings UI or the `/config` API — not environment variables. Legacy `SYNOLOGY_*` env vars are imported once on first boot to seed the config store, then ignored thereafter (see [[docs/adr/015-config-store|ADR-015]]).

### Fields

#### Base fields (all service kinds)

| Field                    | Type    | Default  | Required | Description                                   |
| ------------------------ | ------- | -------- | -------- | --------------------------------------------- |
| `instanceId`             | text    | `"main"` | yes      | Unique ID for this instance within the kind   |
| `enabled`                | boolean | `true`   | —        | Enable/disable polling for this instance      |
| `cacheTtlMs`             | number  | `10000`  | —        | How long to cache health/stats results (ms)   |
| `timeoutMs`              | number  | `5000`   | —        | Request timeout (ms)                          |
| `pollPolicy.healthMs`    | number  | `10000`  | —        | Health-check poll interval (ms)               |
| `pollPolicy.statsMs`     | number  | `30000`  | —        | Stats poll interval (ms)                      |
| `pollPolicy.jitterRatio` | number  | `0.1`    | —        | Random jitter applied to poll intervals (0–1) |

#### Synology-specific fields

| Field              | Type     | Default | Required | Secret  | Description                                                                                                                      |
| ------------------ | -------- | ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `host`             | text     | —       | **yes**  | —       | IP/hostname of the NAS (used for ICMP + SNMP)                                                                                    |
| `snmpUser`         | text     | `""`    | —        | —       | SNMPv3 username                                                                                                                  |
| `snmpAuthKey`      | password | `""`    | —        | **yes** | SNMPv3 authentication key                                                                                                        |
| `snmpPrivKey`      | password | `""`    | —        | **yes** | SNMPv3 privacy (encryption) key                                                                                                  |
| `snmpAuthProtocol` | select   | `"SHA"` | —        | —       | SNMPv3 auth protocol: `SHA` or `MD5`                                                                                             |
| `snmpPrivProtocol` | select   | `"AES"` | —        | —       | SNMPv3 priv protocol: `AES` or `DES`                                                                                             |
| `dsmUrl`           | url      | `""`    | —        | —       | DSM base URL, e.g. `https://nas.local:5001` (optional; enables extended stats when set together with `dsmAccount`/`dsmPassword`) |
| `dsmAccount`       | text     | `""`    | —        | —       | DSM login account                                                                                                                |
| `dsmPassword`      | password | `""`    | —        | **yes** | DSM login password                                                                                                               |

> [!tip] DSM-only mode
> If `snmpUser`/`snmpAuthKey`/`snmpPrivKey` are left empty, the service falls back to DSM-only stats mode (no SNMP metrics). DSM extended stats are fetched whenever all three of `dsmUrl`, `dsmAccount`, and `dsmPassword` are non-empty.

Multi-instance support follows the standard pattern — add additional instances via the Settings UI or `/config` API, each with a distinct `instanceId`. See [[docs/features/multi-instance|Multi-Instance Support]].

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025).

| Endpoint                        | Description                |
| ------------------------------- | -------------------------- |
| `GET /services/synology/health` | Health check               |
| `GET /services/synology/stats`  | System stats, storage info |

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
