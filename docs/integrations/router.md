---
title: Router Integration
type: integration
status: active
date: 2026-05-07
tags: [integration, services, backend, monitoring, two-tier, icmp, tcp, snmp, snmp-walk, snmp-v2c, snmp-v3, interface-stats, cpu-load, connected-clients]
description: Network router integration with two-tier health model (ICMP + TCP probe), SNMP metrics (v2c/v3), and interface statistics collection
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

### Beryl

```bash
BERYL_HOST=192.0.2.1
BERYL_PORTS=80,443
BERYL_TIMEOUT=10000  # optional, default 10s
BERYL_SNMP_COMMUNITY=public  # optional; enables SNMP metrics collection (v2c)
BERYL_INTERFACE_FILTER=eth0,wlan0  # optional; restricts interface stats to these names
```

### Telenet

```bash
TELENET_HOST=192.0.2.1
TELENET_PORTS=80
TELENET_TIMEOUT=10000  # optional, default 10s
TELENET_SNMP_COMMUNITY=public  # optional; enables SNMP metrics collection (v2c)
TELENET_INTERFACE_FILTER=eth0,wlan0  # optional; restricts interface stats to these names
```

## SNMP Configuration (Optional)

When `snmpCommunity` is set, the router service polls SNMP metrics using SNMPv2c (or v3 if configured). This provides additional visibility into router device health and network interface statistics. The SNMP walk implementation (see [[docs/architecture/backend-architecture#infrastructure-layer|Infrastructure Layer]]) supports both v2c and v3 credentials.

Configuration fields:
- **snmpVersion** — SNMP protocol version (default: `v2c`; `v3` also supported via schema but requires additional v3 credentials fields — see [[docs/integrations/synology|Synology Integration]] for v3 example)
- **snmpCommunity** — SNMPv2c community string (e.g., `public`). When present, enables SNMP polling. Marked as a secret field in config store (encrypted with master key)
- **interfaceFilter** — Array of interface names to include in stats (e.g., `["eth0", "wlan0"]`). If empty, all interfaces are collected and summed

### SNMP Metrics Collected

When SNMP is enabled, `getStats()` returns additional metrics alongside base metrics. The service uses [[apps/backend/src/infra/snmp/snmpGetterImpl.ts|SNMP walk]] to collect subtree data in parallel:

| Metric               | OID                      | Type      | Description                                                  |
| -------------------- | ------------------------ | --------- | ------------------------------------------------------------ |
| `sysUptime`          | `1.3.6.1.2.1.1.3`        | number    | System uptime in ticks (centiseconds since reboot)           |
| `connectedClients`   | `1.3.6.1.2.1.4.22.1.2`   | number    | ARP table row count (active MAC addresses on LAN)            |
| `cpuLoad`            | `1.3.6.1.2.1.25.3.3.1.2` | number    | Average processor load across CPU cores (percent, 0–100)     |
| `ifInOctets`         | `1.3.6.1.2.1.2.2.1.10`   | number    | Inbound octets summed across filtered interfaces (bytes)      |
| `ifOutOctets`        | `1.3.6.1.2.1.2.2.1.16`   | number    | Outbound octets summed across filtered interfaces (bytes)     |
| `ifDescr`            | `1.3.6.1.2.1.2.2.1.2`    | array     | Network interface names (collected to build active filter set) |

**Graceful degradation**: If SNMP queries fail or timeout, the service returns base metrics (host, portCount, configured) without SNMP data. No error is raised. All SNMP walks use parallel Promise.all() with a per-request timeout and AbortSignal propagation for clean cancellation.

### Interface Filtering

The `interfaceFilter` array restricts interface statistics (`ifInOctets`, `ifOutOctets`) to named interfaces. Collection happens in two passes:

1. **First walk** (`ifDescr`) builds an index-to-name map (e.g., `1 → eth0`, `2 → wlan0`)
2. **Second pair of walks** (`ifInOctets`, `ifOutOctets`) sums values across matching indices

If `interfaceFilter` is empty, all interfaces are summed. Example: `interfaceFilter: ["eth0", "wlan0"]` excludes loopback and virtual interfaces. This is useful for routers with many interface types.

## Endpoints

| Endpoint                                     | Description         | Auth              |
| -------------------------------------------- | ------------------- | ----------------- |
| `GET /api/beryl/status`                      | Health check        | No (rate limited) |
| `GET /api/beryl/stats`                       | Router statistics   | Yes               |
| `GET /api/telenet/status`                    | Health check        | No (rate limited) |
| `GET /api/telenet/stats`                     | Router statistics   | Yes               |
| `GET /api/router/arp?service=beryl\|telenet` | ARP/neighbor lookup | Yes + CSRF        |

## Service Class

[[apps/backend/src/domain/services/router/RouterService.ts|RouterService]] (`apps/backend/src/domain/services/router/`)

### Dependencies

```typescript
interface RouterDeps {
  ping: PingProber;      // ICMP ping probe (host tier)
  tcp: TcpProber;        // TCP port probe (service tier)
  snmp?: SnmpGetter;     // Optional SNMP walker (v2c/v3)
  config: RouterInstance; // Runtime configuration
  now: () => number;     // Clock function
}
```

### Methods

- `checkHealth(signal: AbortSignal)` — Two-tier health: ICMP ping + TCP port connectivity. Returns composite reachability (`host.reachable OR service.reachable`), latency, and detailed port status
- `getStats(signal: AbortSignal)` — Base metrics (host, portCount, configured) + optional SNMP metrics (sysUptime, connectedClients, cpuLoad, ifInOctets, ifOutOctets). Returns empty SNMP block if collector fails or no credentials set

### ARP Lookup

The `/api/router/arp` endpoint performs network neighbor discovery:

- Uses `ip neigh` (Linux) or `arp -a` (macOS)
- Uses a short-lived in-memory TTL cache (3s) in `RouterArpService` to reduce repeated ARP command executions during rapid refreshes
- Cache pruning is bounded with a max-entry limit to avoid unbounded memory growth while preserving TTL behavior
- Filters by router's interface or subnet
- Returns paginated results with LAN-specific subset
- Strict service validation prevents command injection

## Security

- Only `beryl` and `telenet` services are allowed for ARP lookup
- Requires authentication + CSRF verification
- Input validation prevents command injection
- Host IP validated as proper IPv4 address

## Frontend Component

Removed in Phase 3. Replaced by `ServiceTile` driven by the renderer registry.

## Related

- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 Phase 0a — Two-Tier Health]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/services-health|Services Health API]]
- [[docs/security/index|Security]]
