---
title: Router Integration
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
    tcp,
    snmp,
    snmp-walk,
    snmp-v2c,
    interface-stats,
    cpu-load,
    connected-clients,
  ]
description: Network router integration with two-tier health model (ICMP + TCP probe), SNMP metrics (v2c community string), and interface statistics collection
aliases: [router, beryl, telenet, arp, network, snmp-router]
---

# Router Integration

> [!abstract] Overview
> Monitors network routers (Beryl, Telenet) with two-tier health model and ARP/neighbor lookup capabilities.

## Health Model (Phase 0a)

Two-tier health with inline parallel probe:

- **Host tier** — ICMP ping to router host
- **Service tier** — TCP port connectivity probe (HTTP/HTTPS)
- **Composite reachability** — `host.reachable OR service.reachable` (device considered up if either tier responds)

## Configuration

Router instances are managed via the Settings UI or the `/config` API (DuckDB config store). Legacy `ROUTER_*` environment variables were imported once on first boot and are now ignored — use the config store going forward (ADR-015 / ADR-008).

### Fields

| Field             | Type            | Required | Default                                | Description                                                                                                              |
| ----------------- | --------------- | -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `instanceId`      | string          | yes      | `"main"`                               | Unique identifier for this instance.                                                                                     |
| `enabled`         | boolean         | —        | `true`                                 | Whether the instance is polled.                                                                                          |
| `host`            | string          | **yes**  | —                                      | IP address or hostname of the router (e.g. `192.168.1.1`).                                                               |
| `ports`           | number\[\]      | —        | `[]`                                   | TCP ports to probe (service tier). Empty = no TCP probe.                                                                 |
| `pingCount`       | number          | —        | `1`                                    | Number of ICMP echo requests per health check.                                                                           |
| `snmpCommunity`   | string (secret) | —        | —                                      | SNMPv2c community string (e.g. `public`). When set, enables SNMP stats collection. Stored encrypted with the master key. |
| `interfaceFilter` | string\[\]      | —        | `[]`                                   | Interface names to include in traffic stats (e.g. `["eth0", "wlan0"]`). Empty = all interfaces summed.                   |
| `timeoutMs`       | number          | —        | `5000`                                 | Per-probe timeout in milliseconds (shared by ICMP, TCP, and SNMP).                                                       |
| `cacheTtlMs`      | number          | —        | `10000`                                | How long a cached response is served before a fresh poll is required (ms).                                               |
| `pollPolicy`      | object          | —        | health 10 s / stats 30 s / jitter 10 % | Override polling intervals (`healthMs`, `statsMs`, `jitterRatio`).                                                       |

## SNMP Configuration (Optional)

When `snmpCommunity` is set, the router service polls SNMP metrics using SNMPv2c. This provides additional visibility into router device health and network interface statistics. The SNMP walk implementation (see [[docs/architecture/backend-architecture#infrastructure-layer|Infrastructure Layer]]) performs subtree walks in parallel.

The two relevant config fields are:

- **snmpCommunity** — SNMPv2c community string (e.g., `public`). When present, enables SNMP polling. Stored encrypted with the master key (secret field).
- **interfaceFilter** — Array of interface names to include in stats (e.g., `["eth0", "wlan0"]`). If empty, all interfaces are collected and summed.

### SNMP Metrics Collected

When SNMP is enabled, `getStats()` returns additional metrics alongside base metrics. The service uses [[apps/backend/src/infra/snmp/snmpGetterImpl.ts|SNMP walk]] to collect subtree data in parallel:

| Metric                 | OID                                                             | Type   | Description                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sysUptime`            | `1.3.6.1.2.1.1.3`                                               | number | System uptime in ticks (centiseconds since reboot)                                                                                                         |
| `connectedClients`     | `1.3.6.1.2.1.4.22.1.2`                                          | number | ARP table row count (active MAC addresses on LAN)                                                                                                          |
| `cpuLoad`              | `1.3.6.1.2.1.25.3.3.1.2`                                        | number | Average processor load across CPU cores (percent, 0–100)                                                                                                   |
| `ifInOctets`           | `1.3.6.1.2.1.31.1.1.1.6` (HC), fallback `1.3.6.1.2.1.2.2.1.10`  | number | Inbound octets summed across filtered interfaces (bytes). Prefers 64-bit `ifHCInOctets` (no 4 GiB wrap); falls back to 32-bit when ifXTable is unavailable |
| `ifOutOctets`          | `1.3.6.1.2.1.31.1.1.1.10` (HC), fallback `1.3.6.1.2.1.2.2.1.16` | number | Outbound octets summed across filtered interfaces (bytes), same HC-first strategy                                                                          |
| `ifInBps` / `ifOutBps` | derived                                                         | number | Byte rates computed from counter deltas between polls; omitted on the first poll and when a counter decreases (wrap/reboot)                                |
| `ifDescr`              | `1.3.6.1.2.1.2.2.1.2`                                           | array  | Network interface names (collected to build active filter set)                                                                                             |

**Graceful degradation**: If SNMP queries fail or timeout, the service returns base metrics (host, portCount, configured) without SNMP data. No error is raised. HC-counter walks degrade independently to the 32-bit fallback. All SNMP walks use parallel Promise.all() with a per-request timeout and AbortSignal propagation for clean cancellation.

### Interface Filtering

The `interfaceFilter` array restricts interface statistics (`ifInOctets`, `ifOutOctets`) to named interfaces. Collection happens in two passes:

1. **First walk** (`ifDescr`) builds an index-to-name map (e.g., `1 → eth0`, `2 → wlan0`)
2. **Second pair of walks** (`ifInOctets`, `ifOutOctets`) sums values across matching indices

If `interfaceFilter` is empty, all interfaces are summed. Example: `interfaceFilter: ["eth0", "wlan0"]` excludes loopback and virtual interfaces. This is useful for routers with many interface types.

## Endpoints

No authentication or rate-limiting (single-user trusted-network design — ADR-017/ADR-025). Multiple routers are separate `router` instances; target one with the `instance` query parameter (e.g. `?instance=beryl`).

| Endpoint                                            | Description                                      |
| --------------------------------------------------- | ------------------------------------------------ |
| `GET /services/router/health?instance={instanceId}` | Health check (ICMP + TCP port probe)             |
| `GET /services/router/stats?instance={instanceId}`  | Router statistics, incl. SNMP interface/ARP data |

## Service Class

[[apps/backend/src/domain/services/router/RouterService.ts|RouterService]] (`apps/backend/src/domain/services/router/`)

### Dependencies

```typescript
interface RouterDeps {
  ping: PingProber; // ICMP ping probe (host tier)
  tcp: TcpProber; // TCP port probe (service tier)
  snmp?: SnmpGetter; // Optional SNMP walker (v2c)
  config: RouterInstance; // Runtime configuration
  now: () => number; // Clock function
}
```

### Methods

- `checkHealth(signal: AbortSignal)` — Two-tier health: ICMP ping + TCP port connectivity. Returns composite reachability (`host.reachable OR service.reachable`), latency, and detailed port status
- `getStats(signal: AbortSignal)` — Base metrics (host, portCount, configured) + optional SNMP metrics (sysUptime, connectedClients, cpuLoad, ifInOctets, ifOutOctets). Returns empty SNMP block if collector fails or no credentials set

### ARP Lookup

ARP/neighbor discovery (surfaced through `getStats`, not a separate REST endpoint) works as follows:

- Uses `ip neigh` (Linux) or `arp -a` (macOS)
- Uses a short-lived in-memory TTL cache (3s) in `RouterArpService` to reduce repeated ARP command executions during rapid refreshes
- Cache pruning is bounded with a max-entry limit to avoid unbounded memory growth while preserving TTL behavior
- Filters by router's interface or subnet
- Returns paginated results with LAN-specific subset
- Strict service validation prevents command injection

## Security

- ARP lookup is restricted to configured `router` instances; the service identifier is validated against known instance keys (strict allowlist) to prevent command injection
- Input validation prevents command injection in ARP lookup
- Host IP validated as proper IPv4 address
- No authentication or CSRF — single-user trusted-network model (ADR-017/ADR-025); do not expose the backend beyond the trusted network

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
- [[docs/security/index|Security]]
