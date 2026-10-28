---
title: Raspberry Pi Integration
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
> Monitors a Raspberry Pi device with two-tier health model (ICMP ping host + service tier), direct SSH via persistent connection pool ([[docs/architecture/backend-architecture#ssh-connection-pool|SshPool]]), and detailed system metrics from vcgencmd and /proc. Includes throttling/undervoltage detection. Legacy Mac Mini relay supported as fallback when direct SSH is not configured or fails. pigpiod is optional when SSH or the relay is set up (it does not run on the Pi 5 family).

## Health Model (Phase 0a)

Two-tier health, probed in parallel:

- **Host tier** — ICMP ping to the Pi host
- **Service tier** — pigpiod round-trip (`getCurrentTick()` on the shared connection, bounded by `timeoutMs`)
- **Composite reachability** — `host.reachable || service.reachable`: the Pi is up if either ping or pigpiod answers. A pigpiod failure while ping works shows as a warning.

## Direct SSH Configuration (Preferred, PI1)

Configure direct SSH to the Pi for full system metrics (vcgencmd, /proc). Set these fields via the Settings UI or the `/config` API (configuration is stored in DuckDB; legacy `RASPI_*` environment variables are imported once on first boot then ignored):

| Field           | Type     | Default | Required | Secret  | Description                                      |
| --------------- | -------- | ------- | -------- | ------- | ------------------------------------------------ |
| `host`          | text     | —       | yes      |         | Pi hostname or IP address                        |
| `port`          | number   | `8888`  |          |         | pigpiod TCP port                                 |
| `sshUser`       | text     | —       |          |         | SSH username on the Pi (enables direct SSH path) |
| `sshPort`       | number   | `22`    |          |         | SSH port                                         |
| `sshKeyPath`    | text     | —       |          |         | Path to SSH private key                          |
| `sshPassphrase` | password | —       |          | **yes** | Passphrase for encrypted SSH key                 |
| `sshHostKey`    | text     | —       |          |         | Pinned SSH host key fingerprint (`SHA256:…`)     |
| `pingCount`     | number   | `1`     |          |         | ICMP ping probes per health check                |
| `timeoutMs`     | number   | `5000`  |          |         | Request timeout (ms)                             |

**Preferred path** — when `sshUser` and `sshKeyPath` are set, direct SSH is used. Each stats poll runs these commands as **one compound SSH exec** on the Pi (each in its own subshell, so one failing command only blanks its own field):

- `vcgencmd measure_temp` — CPU temperature (°C)
- `vcgencmd measure_clock arm` — ARM clock rate (MHz after conversion)
- `vcgencmd measure_volts core` — Core voltage (V)
- `vcgencmd get_throttled` — Throttling/undervoltage status (hex → decimal)
- `cat /proc/loadavg` — CPU load average (1-minute)
- `cat /proc/meminfo` — Memory info (formatted as "X.X GB")
- `cat /proc/uptime` — System uptime (seconds)

Uptime comes from `/proc/uptime` (direct SSH) or the relay's `state.boot` time. pigpio's current tick is not used: it is an unsigned 32-bit microsecond counter that wraps every ~71.6 minutes. Without SSH or the relay, `uptime` is `null`.
- `cat /proc/cpuinfo` — CPU model and hardware info
- `cat /etc/os-release` — OS release info

`/proc/cpuinfo` and `/etc/os-release` are read on the first successful poll only and then cached. If the exec produces no output at all, direct SSH counts as failed and the relay (if configured) is tried.

### SSH host key pinning (optional)

Without a pinned key, Watchman accepts whatever host key the server presents, so a machine that takes over the host's IP address would receive Watchman's login. To pin the key:

1. On the Pi, run `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
2. Copy the `SHA256:…` part of the output into **SSH host key fingerprint** (`sshHostKey`).

Watchman then refuses any server whose host key does not match, before it sends any credentials. The service reports `UNAUTHORIZED` with the message `ssh host key mismatch for <host>: expected SHA256:…, server presented SHA256:…`. If the host was reinstalled and the new key is expected, paste the presented fingerprint into the field. Watchman offers ed25519 first, so the ed25519 fingerprint is the one it checks on a standard OpenSSH server.

The legacy relay pins the Mac's key the same way, with `macMiniSshHostKey`.

### pigpiod is optional

pigpiod supplies only `hwRevision`/`piModel` and `pigpioVersion`. When it can't be reached but direct SSH or the relay works, stats still succeed with those fields `null` and the reason in `pigpioError`. Stats fail only when pigpiod **and** every SSH path fail. pigpiod does not support the Pi 5 / CM5 / Pi 500, so on those boards use SSH.

### Throttling Detection

The `throttled` field is the raw `vcgencmd get_throttled` value as a decimal number. Bits 0-3 mean the condition is active **now** (under-voltage, ARM frequency capped, throttled, soft temperature limit). Bits 16-19 are sticky flags meaning the same conditions **have occurred since boot**; they stay set until the next reboot. So a non-zero `throttled` does not by itself mean throttling is active.

Two derived fields split them:

- `throttledNow` = `throttled & 0xF` (non-zero = active now)
- `throttledSinceBoot` = `(throttled >> 16) & 0xF` (non-zero = happened earlier since boot)

Both are `null` when `throttled` is unknown (relay path or no SSH).

## Legacy Mac Mini Relay (Fallback, Backward Compatible)

If `sshUser` and `sshKeyPath` are **not** set, the backend uses a Mac Mini relay (legacy path). Configure these additional fields via the Settings UI or `/config` API:

| Field                  | Type     | Default               | Required | Secret  | Description                                  |
| ---------------------- | -------- | --------------------- | -------- | ------- | -------------------------------------------- |
| `macMiniHost`          | text     | —                     |          |         | Mac Mini hostname or IP (enables relay path) |
| `macMiniSshPort`       | number   | `22`                  |          |         | Mac Mini SSH port                            |
| `macMiniSshUser`       | text     | —                     |          |         | Mac Mini SSH username                        |
| `macMiniSshKeyPath`    | text     | —                     |          |         | Path to Mac Mini SSH private key             |
| `macMiniSshPassphrase` | password | —                     |          | **yes** | Passphrase for Mac Mini SSH key              |
| `macMiniSshHostKey`    | text     | —                     |          |         | Pinned SSH host key fingerprint of the Mac   |
| `nodePath`             | text     | `/usr/local/bin/node` |          |         | Path to Node.js binary on the Mac Mini       |
| `rpiCliPath`           | text     | —                     |          |         | Path to the `rpi-cli` script on the Mac Mini |

**Used when direct SSH is not configured, or when it is configured but fails.** The Mac Mini runs a Node.js CLI (`rpi-cli`) to fetch Pi stats remotely. Less direct, subject to Mac sleep and relay availability.

## Metrics

### Stats Endpoint Response

When direct SSH is used (PI1):

```json
{
  "piModel": "Pi 4B",
  "hwRevision": 3355443,
  "cpuTemp": 45.1,
  "clockRate": 1500,
  "voltage": 1.2,
  "throttled": 0,
  "throttledNow": 0,
  "throttledSinceBoot": 0,
  "load": 0.5,
  "memory": "3.8 GB",
  "uptime": 86400,
  "prettyName": "Debian GNU/Linux 12 (bookworm)",
  "processor": "BCM2835",
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
| **`throttled`**   | number  | Raw `get_throttled` value (see [[#throttling-detection|Throttling Detection]]) |
| `throttledNow`    | number  | Bits 0-3: conditions active now (0 = none)                          |
| `throttledSinceBoot` | number | Bits 16-19 shifted down: conditions seen since boot              |
| `load`            | number  | 1-minute load average                                               |
| `memory`          | string  | Total memory formatted (e.g., "3.8 GB")                             |
| `uptime`          | number  | Uptime in seconds                                                   |
| `prettyName`      | string  | OS name (from /etc/os-release)                                      |
| `processor`       | string  | CPU hardware ID (from /proc/cpuinfo)                                |
| `isRpi`           | boolean | True if running on Raspberry Pi                                     |
| `rpiCliAvailable` | boolean | True if stats fetched (direct SSH or relay succeeded)               |
| `pigpioVersion`   | number  | pigpio daemon version (if available)                                |
| `pigpioError`     | string  | Present when pigpiod was unreachable but SSH data was collected     |

## Endpoints

| Endpoint                             | Description                        | Query Params                                                     |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| `GET /services/raspberryPi/health`   | Health check (two-tier)            | `instance`                                                       |
| `GET /services/raspberryPi/stats`    | Stats (vcgencmd, /proc, pigpio)    | `instance`                                                       |
| `GET /services/raspberryPi/history`  | Time-series history for any metric | `instance`, `metric`, `from`, `to`, `resolution`, `agg`, `limit` |

## Monitoring only

Watchman reads the Pi and never drives it. The former `POST /services/raspberryPi/control`
route and its `gpio:write` / `gpio:mode` actions were removed ([[docs/adr/032-monitoring-only-no-service-control|ADR-032]]). The pigpiod handle
exposes only reads (`read`, `getHardwareRevision`, `getPigpioVersion`, `getCurrentTick`).

## Shared pigpiod Connection

Health checks and stats collection share one persistent pigpiod TCP connection per instance ([[apps/backend/src/infra/gpio/sharedPigpioClient.ts|sharedPigpioClient]]) instead of opening/tearing down two connections per poll cycle. Liveness is verified with a `getCurrentTick()` round-trip. Every command is bounded by `timeoutMs` (pigpiod that loses power never answers), and a failed or timed-out command invalidates the connection so the next call reconnects. The connection is closed on service teardown (`onStop`), including one that finishes connecting after teardown. A failed connect attempt is closed instead of being left to retry in the background.

## SSH Connection Pool (I4)

Direct SSH uses a persistent [[docs/architecture/backend-architecture#ssh-connection-pool|SshPool]] for connection reuse across requests:

- One persistent `ssh2.Client` per `host:port:user:keyPath` tuple
- No background reconnect: a dropped or failed connection is forgotten, and the next exec opens a new one
- Execs queued while the connection is opening, each bounded by its own timeout and abort signal
- An exec that times out or is aborted has its channel closed, so a hung remote command can't use up sshd's `MaxSessions`
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
