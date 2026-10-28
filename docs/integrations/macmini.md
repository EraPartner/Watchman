---
title: Mac Mini Integration
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
    ssh,
    vm_stat,
    smartctl,
    extended-stats,
  ]
description: Mac Mini server integration with extended SSH stats (memory, power, CPU%, network, disk SMART) gathered in one compound SSH exec per cycle; smctemp-first temperature probe for Apple Silicon
aliases: [mac mini, macos server, ssh]
---

# Mac Mini Integration

> [!abstract] Overview
> Monitors a Mac Mini server: health is an ICMP ping to the host, and stats come over SSH. Extended stats gather 15+ metrics across memory, power, CPU utilization, network, and disk health in a single compound SSH exec per cycle.

## Health Model (Phase 0a)

Health is **ping only**:

- **Host tier** — ICMP ping to the Mac Mini host
- **Composite reachability** — `reachable = host.reachable` — host-primary: the box itself is the point (see [[docs/adr/026-reachability-derivation-and-telemetry-scope|ADR-026]]). SSH is not probed by health; an SSH problem shows up as a stats error instead.

macOS stealth mode (Firewall → Options) drops ICMP, which makes a running Mac show offline. Turn stealth mode off, or allow ping, for this host.

## Prerequisites on the Mac

- **Remote Login** on (System Settings → General → Sharing), with key-based login for the configured `sshUser`.
- Optional Homebrew tools, looked up in `/opt/homebrew/bin` (Apple Silicon) and `/usr/local/bin` (Intel), because a non-interactive SSH session's PATH doesn't include them:
  - `smctemp` (preferred on Apple Silicon) or `osx-cpu-temp` for `cpuTemp`
  - `smartmontools` (`smartctl`) for `smartPassed`, `diskTemp`, `diskModel`

Missing tools only leave their metrics `null`.

## Configuration

Configuration lives in the **DuckDB config store** — manage via the Settings UI or the `/config` API. `MACMINI_*` environment variables are **legacy**: they were imported once on first boot and are now ignored (see [[docs/adr/015-ui-driven-service-configuration|ADR-015]]).

### Mac Mini instance fields (`kind: macMini`)

| Field           | Type    | Required | Default                                            | Secret | Description                                               |
| --------------- | ------- | -------- | -------------------------------------------------- | ------ | --------------------------------------------------------- |
| `instanceId`    | string  | yes      | `"main"`                                           |        | Unique identifier for this instance.                      |
| `enabled`       | boolean |          | `true`                                             |        | Whether this instance is polled.                          |
| `host`          | string  | yes      | —                                                  |        | Hostname or IP of the Mac Mini.                           |
| `sshUser`       | string  |          | `""`                                               |        | SSH login username.                                       |
| `sshPort`       | number  |          | `22`                                               |        | SSH port.                                                 |
| `sshKeyPath`    | string  |          | `""`                                               |        | Path to the SSH private key file.                         |
| `sshPassphrase` | string  |          | `""`                                               | yes    | Passphrase for the SSH private key (stored encrypted).    |
| `sshHostKey`    | string  |          | `""`                                               |        | Pinned SSH host key fingerprint (`SHA256:…`). Empty: not pinned. |
| `pingCount`     | number  |          | `1`                                                |        | Number of ICMP pings per health check.                    |
| `timeoutMs`     | number  |          | `5000`                                             |        | Per-request timeout in milliseconds.                      |
| `cacheTtlMs`    | number  |          | `10000`                                            |        | How long to serve a cached result before re-polling (ms). |
| `pollPolicy`    | object  |          | `{healthMs:10000, statsMs:30000, jitterRatio:0.1}` |        | Override polling intervals and jitter for this instance.  |

### SSH host key pinning (optional)

Without a pinned key, Watchman accepts whatever host key the server presents, so a machine that takes over the host's IP address would receive Watchman's login. To pin the key:

1. On the Mac, run `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
2. Copy the `SHA256:…` part of the output into **SSH host key fingerprint** (`sshHostKey`).

Watchman then refuses any server whose host key does not match, before it sends any credentials. The service reports `UNAUTHORIZED` with the message `ssh host key mismatch for <host>: expected SHA256:…, server presented SHA256:…`. If the host was reinstalled and the new key is expected, paste the presented fingerprint into the field. Watchman offers ed25519 first, so the ed25519 fingerprint is the one it checks on a standard OpenSSH server.

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025).

| Endpoint                       | Description          |
| ------------------------------ | -------------------- |
| `GET /services/macMini/health` | Health check         |
| `GET /services/macMini/stats`  | System stats via SSH |

## Stats Metrics

All metrics are nullable (`null` if a command fails or is not available). All commands travel in one compound SSH exec per stats cycle.

### Core Metrics

| Metric             | Source                                           | Type   | Description                      |
| ------------------ | ------------------------------------------------ | ------ | -------------------------------- |
| `cpuLoad`          | `uptime`                                         | number | 1-minute CPU load average        |
| `cpuTemp`          | `smctemp -c`, fallback `osx-cpu-temp` (Homebrew) | number | CPU package temperature (°C)     |
| `diskTotal`        | `df -k /System/Volumes/Data` (else `df -k /`)    | number \| null | Data volume total bytes          |
| `diskUsed`         | `df -k /System/Volumes/Data` (else `df -k /`)    | number \| null | Data volume used bytes           |
| `diskFree`         | `df -k /System/Volumes/Data` (else `df -k /`)    | number \| null | Available bytes (shared APFS container) |
| `diskUsagePercent` | `df -k /System/Volumes/Data` (else `df -k /`)    | number \| null | (total − available) / total      |
| `uptime`           | `uptime`                                         | number \| null | System uptime in seconds (BSD formats: `H:MM`, `N hrs`, `N mins`, `N secs`, with optional `N days`) |
| `cpuUsagePercent`  | `top -l 2 -n 0 -s 1`                             | number \| null | `user + sys` CPU percent         |

On APFS (macOS 10.15+) `/` is the sealed system volume, whose Used column is only the OS; the Data volume holds user data. `cpuLoad`, `cpuTemp`, `uptime` and the disk fields are `null` when not measured (no load line, no `smctemp`/`osx-cpu-temp`, no usable `df` output), never a placeholder 0.

### Extended Memory Metrics (via `vm_stat`)

| Metric             | Type           | Description                                                            |
| ------------------ | -------------- | ---------------------------------------------------------------------- |
| `memFreeBytes`     | number \| null | Free memory pages × page size                                          |
| `memActiveBytes`   | number \| null | Active (in-use) memory pages × page size                               |
| `memWiredBytes`    | number \| null | Kernel-wired memory pages × page size                                  |
| `memInactiveBytes` | number \| null | Inactive (reclaimable) memory pages × page size                        |
| `memTotalBytes`    | number \| null | Total memory: (active + inactive + wired + compressor + free + speculative) × page size |

**Command**: `vm_stat` — parses page size and allocations to derive memory usage in bytes.

### Extended Power Metrics (via `pmset -g batt`)

| Metric            | Type            | Description                                                                 |
| ----------------- | --------------- | --------------------------------------------------------------------------- |
| `onAC`            | boolean \| null | True if drawing power from AC adapter                                       |
| `batteryPercent`  | number \| null  | Battery percentage (0–100) on portable Macs; null if no battery             |
| `batteryCharging` | boolean \| null | True if actively charging; false if charged or discharging; null if unknown |

**Command**: `pmset -g batt` — parses power source and battery state. Nil if command unavailable.

### Extended CPU Metrics (via `top -l 2 -n 0 -s 1`)

| Metric         | Type           | Description                         |
| -------------- | -------------- | ----------------------------------- |
| `cpuUser`      | number \| null | User-space CPU utilization (%)      |
| `cpuSys`       | number \| null | System (kernel) CPU utilization (%) |
| `cpuIdle`      | number \| null | Idle CPU time (%)                   |
| `processCount` | number \| null | Total running process count         |

**Command**: `top -l 2 -n 0 -s 1` (`TOP_CMD`) — two samples one second apart. The first sample has no previous one to diff against, so its CPU line is not a current measurement; the parser uses the last `CPU usage:` and `Processes:` lines. This adds about 1 s to the compound SSH exec, well inside the default 5 s timeout.

### Extended Network Metrics (via `ifconfig en0`)

| Metric        | Type           | Description                                  |
| ------------- | -------------- | -------------------------------------------- |
| `ipAddress`   | string \| null | IPv4 address of primary interface (en0)      |
| `interfaceUp` | boolean        | True if interface is UP and status is active |

**Command**: `ifconfig en0` — parses primary Ethernet/WiFi interface (en0); flags and status fields.

### Extended Disk Health Metrics (via `smartctl -j -a disk0`)

| Metric        | Type            | Description                                                               |
| ------------- | --------------- | ------------------------------------------------------------------------- |
| `smartPassed` | boolean \| null | SMART health test result (passed=true, failed=false, null if unavailable) |
| `diskTemp`    | number \| null  | Disk temperature (°C) from SMART data                                     |
| `diskModel`   | string \| null  | Disk model name from SMART data                                           |

**Command**: `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; which smartctl >/dev/null 2>&1 && smartctl -j -a disk0 2>/dev/null || true` — adds the Homebrew prefixes (each compound segment runs in its own subshell, so it can't rely on the temperature segment's PATH), feature-detects `smartctl` binary; returns JSON output if available, silently succeeds with empty string if not installed.

## Service Class

`apps/backend/src/domain/services/macMini/MacMiniService.ts`

### Methods

- `checkHealth()` — ICMP ping to verify host reachability
- `getStats()` — ONE compound SSH exec carrying all 8 commands; tolerates per-command failures by returning null for unavailable metrics

### Compound Execution (since 2026-06-12)

All commands travel in a single SSH exec ([[apps/backend/src/infra/ssh/compound.ts|compoundCommand]], `@@WATCHMAN_SEGMENT@@`-delimited, each segment subshelled with `|| true`), so a stats cycle costs one SSH round-trip instead of eight:

1. `uptime` — system load and uptime
2. `df -k /System/Volumes/Data 2>/dev/null || df -k /` — Data volume usage (falls back to `/` before Catalina)
3. temp probe — prefers `smctemp -c` (works on Apple Silicon, where the unmaintained `osx-cpu-temp` reads 0.0), falls back to `osx-cpu-temp`
4. `vm_stat` — memory breakdown
5. `pmset -g batt` — power state
6. `top -l 2 -n 0 -s 1` — CPU% and process count (second sample)
7. `ifconfig en0` — network interface
8. `smartctl -j -a disk0` (feature-detect) — disk SMART health

A failing command yields an empty segment (its metrics become null); stats error only when both core segments (`uptime` and `df`) come back empty or the SSH exec itself fails.

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 — Two-Tier Health Model + Per-Service Monitoring Upgrades]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
- [[apps/backend/src/domain/services/macMini/MacMiniService.ts|MacMiniService implementation]]
