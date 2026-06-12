---
title: Philips Hue Bridge Integration
type: integration
status: active
date: 2026-06-12
last-updated: 2026-05-08
tags: [integration, services, backend, monitoring, two-tier, icmp, http, api-v2, cert-pinning, sha256, hue-lights, charts, x3-task]
description: Philips Hue Bridge monitoring with Hue API v2, light metrics, optional SHA-256 certificate pinning, and time-series charts (X3 Task)
aliases: [philips hue, hue bridge, smart lighting, philips bridge]
---

# Philips Hue Bridge Integration

> [!abstract] Overview
> Monitors Philips Hue Bridge with two-tier health model (ICMP ping + HTTP API v2 probe) and optional light metrics. Supports SHA-256 certificate pinning for secure TLS connections.

## Overview

**Service Kind**: `philipsBridge`

The Philips Hue Bridge service provides:
- **Health Checks**: ICMP ping to host; optional HTTP probe to Hue API v2
- **Light Metrics**: Count of total, on, and off lights (requires `applicationKey`)
- **Certificate Pinning**: Optional SHA-256 verification for TLS connections (requires `certHash`)

## Health Model (Phase 0a)

Two-tier health with inline parallel probe:

- **Host tier** — ICMP ping to Hue Bridge host (`PING_COUNT` probes)
- **Service tier** — HTTP `GET /clip/v2/resource/light` probe (when `applicationKey` is configured)
- **Composite reachability** — `host.reachable OR service.reachable` (bridge considered up if either tier responds)

Health snapshot includes `host` and `service` tiers:
```typescript
{
  reachable: boolean;
  latencyMs?: number;
  at: number;
  host: { reachable: boolean; pingMs?: number };
  service?: { reachable: boolean; details: { apiV2: true } };
  details: { host, icmpAlive, apiReachable };
}
```

## Configuration

### Via UI Service Configuration

Supported configuration fields (in the service instance UI):

| Field            | Type                    | Required | Description                                                    |
| ---------------- | ----------------------- | -------- | -------------------------------------------------------------- |
| `host`           | text (hostname/IP)      | Yes      | IP address or hostname of the Hue Bridge                        |
| `pingCount`      | number                  | No       | Number of ping probes per health check (default: 2)            |
| `usePing`        | boolean                 | No       | Enable/disable ICMP ping (default: true)                       |
| `applicationKey` | password (secret field) | No       | Hue API v2 application key; enables light stats when set       |
| `certHash`       | text                    | No       | SHA-256 fingerprint of bridge TLS cert (hex or colon-delimited) |

### Via Environment Variables (Legacy)

```bash
# Minimal configuration (host-only)
PHILIPS_BRIDGE_HOST=192.0.2.200
PHILIPS_BRIDGE_TIMEOUT=10000  # optional, default 10s

# Full configuration with API v2 + cert pinning
PHILIPS_BRIDGE_HOST=192.0.2.200
PHILIPS_BRIDGE_APPLICATION_KEY=your-app-key-here
PHILIPS_BRIDGE_CERT_HASH=ab:cd:ef:...  # colon-delimited or plain hex
```

## Hue API v2 Integration

When `applicationKey` is configured:

### Endpoints Used

- `GET https://<host>/clip/v2/resource/light` — Fetch light list and state

### Request Headers

```http
GET /clip/v2/resource/light HTTP/1.1
Host: <bridge-host>
hue-application-key: <applicationKey>
```

### Response Schema

```json
{
  "data": [
    {
      "id": "light-id",
      "type": "light",
      "on": { "on": true },
      "metadata": { "name": "Living Room" }
    }
  ]
}
```

### Metrics Exposed

```typescript
{
  lightCount: number;    // Total number of lights
  onCount: number;       // Lights currently on
  offCount: number;      // Lights currently off
}
```

### Charts (X3 Task)

When metrics are available, the service dashboard displays three time-series charts:

| Chart        | Metric      | Type | Description                 |
| ------------ | ----------- | ---- | --------------------------- |
| Total Lights | `lightCount`| line | Total number of lights      |
| Lights On    | `onCount`   | area | Lights currently powered on |
| Lights Off   | `offCount`  | area | Lights currently powered off|

The charts show historical trends of light count and on/off distribution, useful for:
- Detecting automation patterns (e.g., lights turning on at specific times)
- Identifying underutilized lights
- Monitoring bridge responsiveness (sudden drops in on/off counts)

## Certificate Pinning (H1 Task)

> [!info] SHA-256 Certificate Pinning
> Protects against man-in-the-middle attacks by pinning the Hue Bridge's TLS certificate fingerprint. When `certHash` is configured, requests go through a pinned HTTP client whose TLS handshake verifies the peer certificate's SHA-256 digest on the very connection that carries the request (custom undici connector; self-signed bridge certs are accepted because identity is established by the pin). Mismatches destroy the socket before any data is sent and surface as `UnauthorizedError`. `probeCertFingerprint` is used only by the pairing wizard to discover the fingerprint.

### Configuration

1. **Obtain the certificate fingerprint**:
   ```bash
   openssl s_client -connect <bridge-host>:443 -servername <bridge-host> < /dev/null 2>/dev/null | \
     openssl x509 -noout -fingerprint -sha256
   ```
   Output: `SHA256 Fingerprint=AB:CD:EF:12:34:56:...`

2. **Format for Watchman** (supports both formats):
   - **Colon-delimited**: `AB:CD:EF:12:34:56:...`
   - **Plain hex**: `ABCDEF123456...` (also accepts lowercase)

3. **Store in configuration**:
   - Via UI: Paste into `certHash` field
   - Via env var: Set `PHILIPS_BRIDGE_CERT_HASH=AB:CD:EF:...`

### How It Works

[[apps/backend/src/infra/http/pinnedClient.ts|pinnedClient.ts]] wraps the HTTP client:

1. Before sending request, probes TLS socket to `<host>:443`
2. Extracts peer certificate (DER-encoded)
3. Computes SHA-256 fingerprint
4. Compares against expected hash (case-insensitive, colon-tolerant)
5. Throws `UnauthorizedError` if mismatch; `UnavailableError` on probe failure

Timeout: 5 seconds (respects request-level timeout override)

## Pairing Wizard (H2 Task)

> [!info] Setup Wizard Pairing Flow
> The pairing wizard automates the process of obtaining an `applicationKey` and `certHash` from your Hue Bridge. Use this when first configuring a bridge in Watchman, or to update credentials without manual `openssl` commands.

### Pairing Endpoint

**POST** `/setup/philips-bridge/pair`

Initiates the pairing flow. Requires the physical **link button** on the bridge to be pressed within the last 30 seconds.

### How to Pair

1. **Open the Setup Wizard** — Go to **Settings → Services** and select **Philips Hue** (or during initial setup)
2. **Press the link button** — Locate the physical link button on the Hue Bridge (usually on top, unmarked circular button). Press and hold for 1–2 seconds until a light blinks.
3. **Enter bridge IP/hostname** — In the configuration form, enter the bridge's IP address (e.g., `192.0.2.200`) or hostname
4. **Trigger pairing** — Click **Pair with Bridge** (or the wizard will auto-pair)
   - Behind the scenes, this calls `POST /setup/philips-bridge/pair` with `{ "host": "192.0.2.200" }`
5. **On success**, the wizard receives and displays:
   - `applicationKey` — Copy this into the `applicationKey` field
   - `certHash` — Copy this into the `certHash` field (optional, but recommended for security)
6. **Save the configuration** — Click **Save Service** to store the credentials

### Request/Response

**Request:**
```json
{
  "host": "192.0.2.200",
  "timeoutMs": 10000
}
```

**Success Response (200):**
```json
{
  "data": {
    "applicationKey": "m-d8c4d2e1f4e5d6c7b8a9...",
    "certHash": "ABCDEF1234567890..."
  }
}
```

**Error: Link button not pressed (400):**
```json
{
  "error": {
    "code": "LINK_BUTTON_NOT_PRESSED",
    "message": "Bridge rejected request: link button not pressed within timeout"
  }
}
```

**Error: Bridge unreachable (503):**
```json
{
  "error": {
    "code": "UNAVAILABLE",
    "message": "Unable to reach bridge at 192.0.2.200:443"
  }
}
```

### What Happens During Pairing

1. **TLS Certificate Probe** — Connects to `<host>:443` and extracts the bridge's TLS certificate
2. **SHA-256 Hash** — Computes the certificate's SHA-256 fingerprint (returned as `certHash`)
3. **API Request** — POSTs to `https://<host>/api` with:
   ```json
   {
     "devicetype": "watchman#host",
     "generateclientkey": true
   }
   ```
4. **Application Key** — Bridge returns a new unique key (username) for this application
5. **Timeout** — Both certificate and API request must complete within `timeoutMs` (default 10s)

### Troubleshooting Pairing

| Issue | Cause | Solution |
|-------|-------|----------|
| "Link button not pressed" | Bridge didn't receive POST within 30s of button press | Press the link button again, wait <1s, then retry |
| "Bridge unreachable" | Network or firewall blocking port 443 | Verify bridge IP, check firewall, ensure bridge is powered on |
| "Timeout" | Bridge is slow or unresponsive | Increase `timeoutMs` parameter (e.g., 15000) or check network latency |
| "Certificate probe failed" | TLS handshake issues | Verify the bridge's certificate is valid; try manual `openssl s_client` command |

### Manual Alternative

If the wizard doesn't work, obtain `applicationKey` and `certHash` manually:

**Application Key:**
```bash
# Press link button, then within 30 seconds run:
curl -X POST https://<bridge-ip>/api \
  -H "Content-Type: application/json" \
  -d '{"devicetype":"watchman#host","generateclientkey":true}' \
  -k  # Skip certificate verification (insecure, for testing only)
```

**Certificate Hash:**
```bash
openssl s_client -connect <bridge-ip>:443 -servername <bridge-ip> < /dev/null 2>/dev/null | \
  openssl x509 -noout -fingerprint -sha256 | \
  cut -d= -f2
```

Then paste both values into the configuration form manually.

## Service Class

[[apps/backend/src/domain/services/philipsBridge/PhilipsBridgeService.ts|PhilipsBridgeService.ts]]

### Constructor

```typescript
constructor(deps: PhilipsBridgeDeps) {
  // If certHash set, wraps HTTP client with certificate pinning
  this.http = deps.config.certHash
    ? createPinnedClient(deps.http, deps.config.certHash)
    : deps.http;
}
```

### Methods

- `checkHealth(signal)` — Two-tier health check
  - ICMP ping to host (via `pinger`)
  - If `applicationKey` set: HTTP probe to `/clip/v2/resource/light`
  - Returns composite `reachable` result
- `getStats(signal)` — Fetch light metrics
  - If no `applicationKey`: returns `{ host, configured }`
  - If `applicationKey` set: fetches lights and returns `{ host, configured, lightCount, onCount, offCount }`

## Test Coverage

[[apps/backend/src/domain/services/philipsBridge/PhilipsBridgeService.test.ts|PhilipsBridgeService.test.ts]] — 16 tests covering:

- Health check with/without API key
- Stats with/without API key
- Light metrics parsing (on/off counts)
- Error handling and timeouts

## Related

- [[docs/adr/020-two-tier-health-and-monitoring-upgrades|ADR-020 — Two-Tier Health and Monitoring Upgrades]]
- [[docs/api/index#configuration--setup-endpoints|API Documentation — Setup/Pairing Endpoints]]
- [[docs/guides/running-the-setup-wizard|Running the Setup Wizard Guide]]
- [[docs/architecture/backend-architecture#certificate-pinning-i2-task|Backend Architecture — Cert Pinning]]
- [[docs/integrations/index|Service Integrations Index]]
- [[apps/backend/src/infra/http/pinnedClient.ts|Pinned HTTP Client]]
- [[apps/backend/src/domain/services/philipsBridge/huePairing.ts|Hue Pairing Module]]
