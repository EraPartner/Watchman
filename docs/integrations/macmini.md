---
title: Mac Mini Integration
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
> Monitors a Mac Mini server via SSH with two-tier health model: ICMP ping to the host, plus SSH probe to verify connectivity. Extended stats gather 15+ metrics across memory, power, CPU utilization, network, and disk health in a single compound SSH exec per cycle.

## Health Model (Phase 0a)

Two-tier health with inline parallel probe:

- **Host tier** — ICMP ping to Mac Mini host
- **Service tier** — SSH uptime command probe
- **Composite reachability** — `host.reachable AND service.reachable`

## Configuration

```bash
MACMINI_HOST=127.0.0.1
MACMINI_SSH_USER=your-username
MACMINI_SSH_KEY_PATH=/path/to/your/ssh/key
MACMINI_SSH_PORT=22  # optional, default 22
MACMINI_TIMEOUT=10000  # optional, default 10s
MACMINI_PING_COUNT=1  # optional, default 1
```

## Endpoints

| Endpoint                  | Description          | Auth              |
| ------------------------- | -------------------- | ----------------- |
| `GET /api/macmini/status` | Health check         | No (rate limited) |
| `GET /api/macmini/stats`  | System stats via SSH | Yes               |

## Stats Metrics

All metrics are nullable (`null` if a command fails or is not available). All commands travel in one compound SSH exec per stats cycle.

### Core Metrics

| Metric             | Source                                           | Type   | Description                      |
| ------------------ | ------------------------------------------------ | ------ | -------------------------------- |
| `cpuLoad`          | `uptime`                                         | number | 1-minute CPU load average        |
| `cpuTemp`          | `smctemp -c`, fallback `osx-cpu-temp` (Homebrew) | number | CPU package temperature (°C)     |
| `diskTotal`        | `df -k /`                                        | number | Root filesystem total bytes      |
| `diskUsed`         | `df -k /`                                        | number | Root filesystem used bytes       |
| `diskFree`         | `df -k /`                                        | number | Root filesystem available bytes  |
| `diskUsagePercent` | `df -k /`                                        | number | Root filesystem usage percentage |
| `uptime`           | `uptime`                                         | number | System uptime in seconds         |

### Extended Memory Metrics (via `vm_stat`)

| Metric             | Type           | Description                                                            |
| ------------------ | -------------- | ---------------------------------------------------------------------- |
| `memFreeBytes`     | number \| null | Free memory pages × page size                                          |
| `memActiveBytes`   | number \| null | Active (in-use) memory pages × page size                               |
| `memWiredBytes`    | number \| null | Kernel-wired memory pages × page size                                  |
| `memInactiveBytes` | number \| null | Inactive (reclaimable) memory pages × page size                        |
| `memTotalBytes`    | number \| null | Total used memory (active + inactive + wired + compressor) × page size |

**Command**: `vm_stat` — parses page size and allocations to derive memory usage in bytes.

### Extended Power Metrics (via `pmset -g batt`)

| Metric            | Type            | Description                                                                 |
| ----------------- | --------------- | --------------------------------------------------------------------------- |
| `onAC`            | boolean \| null | True if drawing power from AC adapter                                       |
| `batteryPercent`  | number \| null  | Battery percentage (0–100) on portable Macs; null if no battery             |
| `batteryCharging` | boolean \| null | True if actively charging; false if charged or discharging; null if unknown |

**Command**: `pmset -g batt` — parses power source and battery state. Nil if command unavailable.

### Extended CPU Metrics (via `top -l 1 -n 0 -s 0`)

| Metric         | Type           | Description                         |
| -------------- | -------------- | ----------------------------------- |
| `cpuUser`      | number \| null | User-space CPU utilization (%)      |
| `cpuSys`       | number \| null | System (kernel) CPU utilization (%) |
| `cpuIdle`      | number \| null | Idle CPU time (%)                   |
| `processCount` | number \| null | Total running process count         |

**Command**: `top -l 1 -n 0 -s 0` — single snapshot of top; parsed for CPU usage and process count.

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

**Command**: `which smartctl >/dev/null 2>&1 && smartctl -j -a disk0 2>/dev/null || true` — feature-detects `smartctl` binary; returns JSON output if available, silently succeeds with empty string if not installed.

## Service Class

`apps/backend/src/domain/services/macMini/MacMiniService.ts`

### Methods

- `checkHealth()` — ICMP ping to verify host reachability
- `getStats()` — ONE compound SSH exec carrying all 8 commands; tolerates per-command failures by returning null for unavailable metrics

### Compound Execution (since 2026-06-12)

All commands travel in a single SSH exec ([[apps/backend/src/infra/ssh/compound.ts|compoundCommand]], `@@WATCHMAN_SEGMENT@@`-delimited, each segment subshelled with `|| true`), so a stats cycle costs one SSH round-trip instead of eight:

1. `uptime` — system load and uptime
2. `df -k /` — filesystem usage
3. temp probe — prefers `smctemp -c` (works on Apple Silicon, where the unmaintained `osx-cpu-temp` reads 0.0), falls back to `osx-cpu-temp`
4. `vm_stat` — memory breakdown
5. `pmset -g batt` — power state
6. `top -l 1 -n 0 -s 0` — CPU% and process count
7. `ifconfig en0` — network interface
8. `smartctl -j -a disk0` (feature-detect) — disk SMART health

A failing command yields an empty segment (its metrics become null/0); stats error only when both core segments (`uptime` and `df`) come back empty or the SSH exec itself fails.

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 — Two-Tier Health Model + Per-Service Monitoring Upgrades]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
- [[apps/backend/src/domain/services/macMini/MacMiniService.ts|MacMiniService implementation]]
