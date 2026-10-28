---
title: Synology Integration
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
- **Session recovery**: On DSM error codes 106/107/119 (session timeout / duplicate-login interruption / SID not found):
  - Re-logs in once
  - Retries the original call
  - Throws `UnavailableError` if retry also fails
- **Permission denied (105)**: the account lacks privilege for that API. No re-login (a new session can't fix it); throws `UnauthorizedError` asking for an account in the `administrators` group
- **Other errors**: DSM error codes → `UnavailableError`; missing credentials → `UnauthorizedError`
- **Concurrency**: Concurrent calls share a single pending login (thundering herd prevention via `pendingLogin: Promise<string> | null` pattern)
- **Rejected-login cooldown**: a login that fails with `UnauthorizedError` (wrong account or password) is remembered for 5 minutes (`LOGIN_FAILURE_BACKOFF_MS`). During that time every call rethrows the same error without contacting DSM, so polling cannot keep adding failed attempts and trip DSM's Auto Block IP ban. A successful login clears it. The client is rebuilt when the service config changes, so corrected credentials are tried at once
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
  now?: () => number; // Clock for the rejected-login cooldown; defaults to Date.now
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

At least one of the two sources must be configured; `getStats()` returns `UnauthorizedError` when neither SNMPv3 credentials nor DSM credentials are set.

- **SNMP** (SNMPv3 credentials set): core metrics (CPU, memory, uptime, network counters). When SNMP is configured, an SNMP get failure fails the stats call.
- **DSM API** (`dsmUrl`, `dsmAccount`, `dsmPassword` all set): extended telemetry (system status, fan/power state, storage health, disk totals) plus `SYNO.Core.System.Utilization`, which supplies CPU and memory when SNMP values are absent.
- **DSM-only mode**: with no SNMPv3 credentials, the SNMP calls are skipped and DSM is the only source (see the DSM-only tip below). Stats fail only if every DSM call fails.
- **Concurrency**: the SNMP get, the network walk, and all DSM calls run in parallel via `Promise.allSettled`
- **Graceful degradation**: individual DSM call failures do not fail stats; their fields are omitted from the response, and the failure is reported as `dsmError` (see below)
- **Missing values are `null`**: a metric that neither source supplies (SNMP varbind error, DSM-only mode, no DSM storage data) is reported as `null`, not `0` or `""`, so the UI shows "—" instead of, for example, an idle NAS at 0 °C. This covers `systemName`, `systemModel`, `systemVersion`, `uptime`, `cpuUsage`, `cpuTemp`, the `memory*` fields and the `disk*` totals
- **DSM fallbacks for SNMP fields**: `systemModel` falls back to DSM Info `model`, `systemVersion` to `version_string` (else `version`), and `cpuTemp` to DSM Info `temperature`; `cpuUsage` and `memoryUsagePercent` fall back to `SYNO.Core.System.Utilization`
- **`systemStatus`**: `"Normal"` when SYNOLOGY-SYSTEM-MIB `systemStatus` is 1, `"Warning"` for any other value, and `"Unknown"` when the value is unreadable (SNMP failed, varbind error, or DSM-only mode)
- **`dsmError`**: when DSM is configured and any DSM call failed, `dsmError` carries the error message (an `UnauthorizedError` such as a rejected password is preferred over other failures); it is absent when every DSM call succeeded. This makes a DSM failure visible in SNMP+DSM mode, where it would otherwise only show as missing DSM metrics

### Network Counters

- `networkRx`/`networkTx` sum the octet counters of the NAS's external interfaces, found by walking `ifDescr` (ifIndex 1 on DSM is loopback `lo`). Selection: `bond*` if present, else `ovs_*` (Virtual Machine Manager's Open vSwitch ports), else `eth*`, else every interface; `lo`, `docker*`, `veth*`, `br-*`, `sit*`, `tun*`, `tap*` and `dummy*` are always excluded. The 64-bit ifXTable HC counters (`1.3.6.1.2.1.31.1.1.1.6` / `.10`) are preferred; the 32-bit `1.3.6.1.2.1.2.2.1.10` / `.16` columns are a fallback (they wrap at 4 GiB).
- CPU and memory use UCD-SNMP-MIB, which Synology's MIB guide lists for DSM: `cpuUsage` = 100 − `ssCpuIdle` (`1.3.6.1.4.1.2021.11.11.0`); memory from `memTotalReal`/`memAvailReal`/`memBuffer`/`memCached` (`1.3.6.1.4.1.2021.4.5/6/14/15.0`, kB), with buffers and cache counted as available like DSM's "real usage". SYNOLOGY-SYSTEM-MIB has no CPU or memory scalars (`.1.5.2` is `serialNumber`, `.1.5.4` is `upgradeAvailable`).
- `uptime` uses `hrSystemUptime` (`1.3.6.1.2.1.25.1.1.0`, host uptime), falling back to `sysUpTime` (the SNMP agent's own uptime).
- Disk totals (`diskTotal`, `diskUsed`, `diskFree`, `diskUsagePercent`) come only from the DSM storage API. SNMP has no volume-size scalar (`1.3.6.1.4.1.6574.2.1.1.*` are per-disk type/status/temperature columns), so they are `null` in SNMP-only mode.
- `networkRxBps`/`networkTxBps` are byte rates derived from counter deltas between polls; omitted on the first poll and when a counter decreases (wrap/reboot). The tile's "Net RX" value and the Network RX/TX charts show these rates (formatted as bytes per second); the cumulative `networkRx`/`networkTx` counters appear only in the detail sheet.
- If the `ifDescr` walk or a needed counter walk fails, `networkRx`/`networkTx` and the rates are omitted for that poll and the previous sample stays the rate baseline. A failed HC walk is not replaced by the 32-bit sum, and rates are only computed between two samples of the same counter kind (HC or 32-bit), so a partial walk can't produce a fake traffic spike.

### DSM API Calls

| API                        | Method      | Field Keys                                                             |
| -------------------------- | ----------- | ---------------------------------------------------------------------- |
| `SYNO.DSM.Info`            | `getinfo`   | `dsmModel`, `dsmVersion` (`version_string`, else `version`), `dsmTemperature` |
| `SYNO.Core.System.Status`  | `get`       | `cpuFanStatus`, `sysFanStatus`, `powerStatus`                          |
| `SYNO.Storage.CGI.Storage` | `load_info` | `volumeCount`, `volumeDegradedCount`, `diskCount`, `diskDegradedCount` |

All new fields are **optional** in the stats response and included only when DSM is configured and calls succeed. A failed call is reported in `dsmError` instead.

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
- **Service tier** — SNMPv3 get of system name, uptime, model, version and status. In DSM-only mode (no SNMPv3 credentials, DSM configured) it is a DSM `SYNO.DSM.Info getinfo` call instead
- **Composite reachability** — `reachable = service.reachable` — daemon-primary: the SNMP/DSM probe defines health; the host/ICMP tier is retained for diagnostics only (see [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]])

## Configuration

Service instances are configured via the Settings UI or the `/config` API — not environment variables. Legacy `SYNOLOGY_*` env vars are imported once on first boot to seed the config store, then ignored thereafter (see [[docs/adr/015-ui-driven-service-configuration|ADR-015]]).

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
| `dsmCertSha256`    | text     | `""`    | —        | —       | SHA-256 fingerprint of DSM's TLS certificate. Needed only for `https://` with DSM's self-signed certificate                       |

> [!tip] DSM-only mode
> If `snmpUser`/`snmpAuthKey`/`snmpPrivKey` are left empty, the service falls back to DSM-only mode (no SNMP metrics): health probes DSM, and if every DSM call fails, stats return that error instead of zeros. DSM extended stats are fetched whenever all three of `dsmUrl`, `dsmAccount`, and `dsmPassword` are non-empty.

### DSM over HTTPS with a self-signed certificate

DSM ships with a self-signed certificate, which Watchman does not trust by default. With an `https://` DSM URL and no fingerprint, DSM calls fail with `synology dsm: the certificate at https://… is not trusted (…)`. Either use `http://nas.local:5000` on a trusted network, or pin the certificate:

1. Run `openssl s_client -connect nas.local:5001 </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256`.
2. Copy the hex after `sha256 Fingerprint=` into **DSM certificate fingerprint (SHA-256)** (`dsmCertSha256`). Colons are fine.

Watchman then accepts exactly that certificate and checks it during the TLS handshake, before the DSM password is sent. Any other certificate is refused with `UNAUTHORIZED` (`cert pin mismatch …`). When DSM renews or replaces its certificate, update the fingerprint. A certificate from a public CA (for example DSM's Let's Encrypt option) works without a fingerprint.

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

Removed in Phase 3. Replaced by `ServiceTile` with `synologyRenderer` from the renderer registry
(`apps/frontend/src/services/renderers/synology.ts`).

- **Tile summary**: CPU, temperature, and `networkRxBps` as "Net RX" (a rate).
- **Detail sheet**: System (including "DSM API error" from `dsmError`, "—" when absent), CPU,
  Memory, Disk, Network (rates and cumulative counters) and health-sourced Status groups.
- **Tone**: `crit` when health is offline, `systemStatus` is `"Warning"`, CPU ≥ 90 % or
  temperature ≥ 80 °C; `warn` when health is warning (a tier is down), CPU ≥ 80 %, temperature
  ≥ 70 °C, or `dsmError` is a non-empty string; otherwise `ok`.

## Related

- [[docs/guides/service-setup/synology|Setup guide]]: what to enable on the service, least-privilege credentials, and how to add it in Watchman
- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/features/multi-instance|Multi-Instance Support]]
- [[docs/api/services-health|Services Health API]]
