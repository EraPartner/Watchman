---
title: Raspberry Pi Integration
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
    ssh-pool,
    vcgencmd,
    throttled,
    pi1,
    x3-renderer,
    frontend,
    bento,
    charts,
    voltage,
    fmtVolt,
  ]
description: Raspberry Pi device integration with direct SSH via persistent connection pool, vcgencmd metrics, throttling detection, /proc stats. Two-tier health model (ICMP host + service tier). Legacy Mac Mini relay fallback. Frontend bento renderer with voltage chart, throttle-aware status tone, and expanded detail sections.
aliases: [raspberry pi, rpi, pi device]
---

# Raspberry Pi Integration

> [!abstract] Overview
> Monitors a Raspberry Pi device with two-tier health model (ICMP ping host + service tier), direct SSH via persistent connection pool ([[docs/architecture/backend-architecture#ssh-connection-pool|SshPool]]), and detailed system metrics from vcgencmd and /proc. Includes throttling/undervoltage detection. Legacy Mac Mini relay supported as fallback when direct SSH not configured.

## Health Model (Phase 0a)

Two-tier health with inline parallel probe:

- **Host tier** — ICMP ping to Pi host
- **Service tier** — SSH uptime + pigpio reachability probe
- **Composite reachability** — `host.reachable` (device is up if ping succeeds)

## Direct SSH Configuration (Preferred, PI1)

Configure direct SSH to the Pi for full system metrics (vcgencmd, /proc):

```bash
RASPI_HOST=192.0.2.230
RASPI_SSH_USER=pi
RASPI_SSH_KEY_PATH=/home/user/.ssh/id_rsa
RASPI_SSH_PORT=22  # optional, default 22
RASPI_SSH_PASSPHRASE=  # optional, for encrypted keys
RASPI_TIMEOUT=10000  # optional, default 10s

# Pigpio (optional, for I/O monitoring)
RASPI_PIGPIO_HOST=192.0.2.230  # optional, defaults to RASPI_HOST
RASPI_PIGPIO_PORT=8888  # optional, default 8888
```

**Preferred path** — when `sshUser` and `sshKeyPath` are set, direct SSH is used. The backend runs 9 SSH commands concurrently on the Pi:

- `vcgencmd measure_temp` — CPU temperature (°C)
- `vcgencmd measure_clock arm` — ARM clock rate (MHz after conversion)
- `vcgencmd measure_volts core` — Core voltage (V)
- `vcgencmd get_throttled` — Throttling/undervoltage status (hex → decimal)
- `cat /proc/loadavg` — CPU load average (1-minute)
- `cat /proc/meminfo` — Memory info (formatted as "X.X GB")
- `cat /proc/uptime` — System uptime (seconds)
- `cat /proc/cpuinfo` — CPU model and hardware info
- `cat /etc/os-release` — OS release info

All commands execute in parallel with `Promise.allSettled`. If all fail, the first error is re-thrown (total SSH failure). Partial failures are acceptable (e.g., single command timeout).

### Throttling Detection

The `throttled` field (from `vcgencmd get_throttled`) is a decimal value where:

- **0** = No throttling or undervoltage
- **Non-zero** = Throttling or undervoltage event active

Bit flags indicate: under-voltage, ARM frequency capped, currently throttled, etc. See [[#metrics|Metrics]] for API representation.

## Legacy Mac Mini Relay (Fallback, Backward Compatible)

If `sshUser` and `sshKeyPath` are **not** set, the backend uses a Mac Mini relay (legacy path):

```bash
# Pi configuration (pigpio only)
RASPI_HOST=192.0.2.230
RASPI_PORT=8888

# Mac Mini relay (used for rpi-cli over SSH)
RASPI_MACMINI_HOST=192.168.1.10
RASPI_MACMINI_SSH_USER=admin
RASPI_MACMINI_SSH_KEY_PATH=/path/to/mac/key
RASPI_MACMINI_SSH_PORT=22  # optional, default 22
RASPI_NODE_PATH=/usr/local/bin/node
RASPI_RPI_CLI_PATH=/path/to/rpi-cli
```

**Used only when direct SSH not configured.** The Mac Mini runs a Node.js CLI (`rpi-cli`) to fetch Pi stats remotely. Less direct, subject to Mac sleep and relay availability.

## Metrics

### Stats Endpoint Response

When direct SSH is used (PI1):

```json
{
  "piModel": "Raspberry Pi 4 Model B",
  "hwRevision": 3355443,
  "cpuTemp": 45.1,
  "clockRate": 1500,
  "voltage": 1.2,
  "throttled": 0,
  "load": 0.5,
  "memory": "3.8 GB",
  "uptime": 86400,
  "prettyName": "Debian GNU/Linux 12 (bookworm)",
  "processor": "ARMv7 Processor rev 4 (v7l)",
  "isRpi": true,
  "rpiCliAvailable": true,
  "pigpioVersion": 79
}
```

| Metric            | Type    | Description                                                         |
| ----------------- | ------- | ------------------------------------------------------------------- |
| `piModel`         | string  | Pi model derived from hardware revision                             |
| `hwRevision`      | number  | Hardware revision code                                              |
| `cpuTemp`         | number  | CPU temperature (°C)                                                |
| `clockRate`       | number  | ARM clock speed (MHz)                                               |
| `voltage`         | number  | Core voltage (V)                                                    |
| **`throttled`**   | number  | Throttling status (0 = healthy, non-zero = throttling/undervoltage) |
| `load`            | number  | 1-minute load average                                               |
| `memory`          | string  | Total memory formatted (e.g., "3.8 GB")                             |
| `uptime`          | number  | Uptime in seconds                                                   |
| `prettyName`      | string  | OS name (from /etc/os-release)                                      |
| `processor`       | string  | CPU hardware ID (from /proc/cpuinfo)                                |
| `isRpi`           | boolean | True if running on Raspberry Pi                                     |
| `rpiCliAvailable` | boolean | True if stats fetched (direct SSH or relay succeeded)               |
| `pigpioVersion`   | number  | pigpio daemon version (if available)                                |

## Endpoints

| Endpoint                             | Description                        | Query Params                                                     |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| `GET /services/raspberryPi/health`   | Health check (two-tier)            | `instance`                                                       |
| `GET /services/raspberryPi/stats`    | Stats (vcgencmd, /proc, pigpio)    | `instance`                                                       |
| `POST /services/raspberryPi/control` | GPIO control (see below)           | `instance`; body `{ "action": "gpio:..." }`                      |
| `GET /services/raspberryPi/history`  | Time-series history for any metric | `instance`, `metric`, `from`, `to`, `resolution`, `agg`, `limit` |

## GPIO Control

`RaspberryPiService` implements the `Controllable` interface via [[apps/backend/src/domain/services/raspberryPi/GpioController.ts|GpioController]]. Action grammar for `POST /services/raspberryPi/control`:

- `gpio:write:<pin>:<0|1>` — set an output pin level (pins 0–53 validated)
- `gpio:mode:<pin>:<input|output>` — switch a pin's mode

Invalid pins/levels/modes return `400 VALIDATION`; pigpiod connection failures return `503 UNAVAILABLE`.

## Shared pigpiod Connection

Health checks, stats collection and GPIO control share one persistent pigpiod TCP connection per instance ([[apps/backend/src/infra/gpio/sharedPigpioClient.ts|sharedPigpioClient]]) instead of opening/tearing down two connections per poll cycle. Liveness is verified with a `getCurrentTick()` round-trip; a failed command invalidates the connection (next call reconnects), and the connection is closed on service teardown (`onStop`).

## SSH Connection Pool (I4)

Direct SSH uses a persistent [[docs/architecture/backend-architecture#ssh-connection-pool|SshPool]] for connection reuse across requests:

- One persistent `ssh2.Client` per `host:port:user:keyPath` tuple
- Automatic reconnect on disconnect (2-second delay)
- Pending requests queued during reconnection
- No reconnect on auth errors (bad key path is a config error)
- `destroy()` called on backend shutdown

See [[docs/architecture/backend-architecture#ssh-connection-pool|Backend Architecture — SSH Connection Pool]] for implementation details.

## Service Class

[[apps/backend/src/domain/services/raspberryPi/RaspberryPiService.ts|RaspberryPiService.ts]]

Key helper: [[apps/backend/src/domain/services/raspberryPi/PiStatsCollector.ts|PiStatsCollector.ts]] — Collects stats via pigpio + direct SSH or legacy relay.

### Methods

- `checkHealth()` - ICMP ping + pigpio or SSH relay
- `getStats()` - Detailed metrics (vcgencmd, /proc, pigpio)

## Frontend Rendering (PI1 + X3 Renderer)

The Raspberry Pi service is rendered in the bento dashboard via `raspberryPiRenderer` in [[apps/frontend/src/services/renderers/raspberryPi.ts|raspberryPi.ts]]:

### Summary Row

- **Temperature** (fmtTempC) — CPU temperature in °C
- **Clock** (fmtNumber) — ARM clock rate in MHz
- **Uptime** (fmtUptime) — System uptime in human-readable format

### Detail Sections

**CPU Section:**

- Temperature (°C)
- Clock rate (MHz)
- Core voltage (V, via `fmtVolt` formatter added in X3)
- Throttle status (hex or decimal; "OK" if 0)
- Load avg 1-minute (CPU load)

**Memory Section:**

- Total RAM (raw formatted string, e.g., "3.8 GB")

**Host Section:**

- Model — Pi model derived from hardware revision
- OS — Operating system name (prettyName from /etc/os-release)
- Processor — CPU hardware identifier
- Is Raspberry Pi — Boolean flag
- pigpio version (if available)
- rpi-cli availability
- rpi-cli error (if failed)
- Uptime (human-readable)

### Charts (PI1 + X3)

Four time-series charts enabled:

1. **CPU temp** — `cpuTemp` metric (fmtTempC)
2. **Clock rate** — `clockRate` metric (fmtNumber)
3. **Core voltage** — `voltage` metric (fmtVolt, new in X3)
4. **Load avg** — `load` metric (fmtNumber)

### Status Tone (X3)

Health status determined by `tone()` function:

- **`crit`** — Service offline OR CPU temp ≥ 80°C
- **`warn`** — Health warning state OR CPU temp ≥ 70°C OR throttling active (`throttled !== 0`)
- **`ok`** — All conditions nominal

The addition of throttle detection (`throttled !== 0`) in X3 triggers a warning tone when the Pi is throttling due to thermal or voltage constraints.

### Formatter: `fmtVolt`

Added in X3 to [[apps/frontend/src/services/renderers/formatters.ts|formatters.ts]]:

```typescript
export const fmtVolt: MetricFormatter = (v) => {
  const n = toNumber(v);
  if (n === undefined) return "—";
  return `${n.toFixed(4)}V`;
};
```

Formats voltage values to 4 decimal places with the "V" unit suffix.

## Related

- [[docs/adr/018-split-deploy-pi-backend|ADR-018 — Split Deploy (Pi backend native)]]
- [[docs/adr/019-two-tier-health-and-monitoring-upgrades|ADR-019 — Two-Tier Health + Monitoring Upgrades]]
- [[docs/architecture/backend-architecture#ssh-connection-pool|Backend Architecture — SSH Connection Pool]]
- [[docs/integrations/index|Service Integrations]]
- [[docs/api/index|API Documentation]]
