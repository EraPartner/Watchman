---
title: Configuration API Reference
type: api
status: active
date: 2026-04-19
tags: [api, configuration, setup, audit, backup, export, import, endpoints]
description: REST API reference for runtime service configuration endpoints - CRUD operations, test connection, backup/restore, audit log
aliases: [config api, configuration endpoints, setup api]
---

# Configuration API Reference

> [!abstract] Overview
> Runtime CRUD endpoints for managing service configurations, plus setup wizard status and audit trail.
>
> **Base URL**: `http://localhost:3001`
>
> **Auth**: All endpoints except `GET /setup/status` require JWT authentication
>
> **Response Format**: Standard [[docs/api/index|API response envelope]]

## Endpoints

### Setup Wizard Status

#### `GET /setup/status`

Check setup wizard state — no auth required.

**Response:**

```json
{
  "data": {
    "needsSetup": false,
    "hasServices": true,
    "adminConfigured": true
  }
}
```

**Response Schema:**

```typescript
{
  needsSetup: boolean  // true if no services configured yet
  hasServices: boolean // true if at least one service exists
  adminConfigured: boolean // true if AUTH_USERNAME is set in env
}
```

---

### Service Kinds & Schemas

#### `GET /config/kinds`

Fetch all service kind schemas with UI field metadata.

**Response:**

```json
{
  "data": {
    "bitcoin": {
      "schema": {
        "type": "object",
        "properties": {
          "onionUrl": { "type": "string" },
          "rpcUser": { "type": "string" },
          "rpcPassword": { "type": "string" },
          "rpcPort": { "type": "integer", "default": 8332 }
        },
        "required": ["onionUrl", "rpcUser", "rpcPassword"]
      },
      "fields": [
        {
          "name": "onionUrl",
          "label": "Onion Address",
          "type": "text",
          "required": true,
          "help": "Tor hidden service URL"
        },
        {
          "name": "rpcUser",
          "label": "RPC User",
          "type": "text",
          "required": true
        },
        {
          "name": "rpcPassword",
          "label": "RPC Password",
          "type": "password",
          "secret": true,
          "required": true
        },
        {
          "name": "rpcPort",
          "label": "RPC Port",
          "type": "number",
          "required": false,
          "placeholder": "8332"
        }
      ]
    },
    "adguard": { /* ... */ },
    "synology": { /* ... */ },
    /* ... other kinds ... */
  }
}
```

**Field Metadata:**

| Property   | Type     | Description                                    |
|-----------|----------|------------------------------------------------|
| `name`    | string   | Config field name                             |
| `label`   | string   | UI label                                       |
| `type`    | string   | `text`, `password`, `number`, `select`, etc.   |
| `secret`  | boolean  | If true, encrypt at rest and redact on GET    |
| `required`| boolean  | If true, validation fails when absent          |
| `placeholder` | string | UI placeholder text                           |
| `help`    | string   | Inline help text                              |
| `options` | array    | For `type: "select"`: `[{ label, value }, ...]` |

---

### Service Instances

#### `GET /config/services`

List all configured service instances.

**Query Parameters:**

| Param   | Type   | Default | Description          |
|---------|--------|---------|----------------------|
| `limit` | number | 100     | Max results          |
| `offset`| number | 0       | Pagination offset    |

**Response:**

```json
{
  "data": [
    {
      "id": "bitcoin:main",
      "kind": "bitcoin",
      "name": "Main Bitcoin Node",
      "enabled": true,
      "config": {
        "onionUrl": "http://example.onion",
        "rpcUser": "bitcoinrpc",
        "rpcPassword": "***",
        "rpcPort": 8332
      },
      "createdAt": 1713446400000,
      "updatedAt": 1713446400000
    },
    {
      "id": "qbittorrent:1",
      "kind": "qbittorrent",
      "name": "qBittorrent (Office)",
      "enabled": true,
      "config": {
        "url": "http://192.0.2.10:8069",
        "username": "admin",
        "password": "***"
      },
      "createdAt": 1713446400000,
      "updatedAt": 1713446400000
    }
  ]
}
```

**ServiceInstance Schema:**

```typescript
{
  id: string                    // "${kind}:${instanceId}"
  kind: string                  // Service kind (bitcoin, adguard, etc.)
  name: string                  // User-friendly name
  enabled: boolean              // Enabled/disabled status
  config: Record<string, any>   // Public config; secrets masked as "***"
  createdAt: number            // Timestamp (ms)
  updatedAt: number            // Timestamp (ms)
}
```

---

#### `POST /config/services`

Create a new service instance.

**Request Body:**

```json
{
  "kind": "bitcoin",
  "name": "Main Bitcoin Node",
  "config": {
    "onionUrl": "http://example.onion",
    "rpcUser": "bitcoinrpc",
    "rpcPassword": "secret123",
    "rpcPort": 8332
  }
}
```

**Request Schema:**

```typescript
{
  kind: string                  // Service kind
  name: string                  // User-friendly name (optional; defaults to kind)
  config: Record<string, any>   // Per-kind config; validate against kind schema
}
```

**Response:**

Same as `GET /config/services/{id}` below. Also emits `config:service.created` event (WebSocket broadcast).

**Error Codes:**

- `400 VALIDATION` — Config missing required fields or invalid per kind schema
- `409 CONFLICT` — Duplicate name or kind+instanceId already exists

---

#### `GET /config/services/{id}`

Fetch a single service instance.

**Path Parameters:**

| Param | Description   |
|-------|---------------|
| `id`  | `{kind}:{instanceId}` or auto-generated ID |

**Response:**

```json
{
  "data": {
    "id": "bitcoin:main",
    "kind": "bitcoin",
    "name": "Main Bitcoin Node",
    "enabled": true,
    "config": {
      "onionUrl": "...",
      "rpcUser": "...",
      "rpcPassword": "***",
      "rpcPort": 8332
    },
    "createdAt": 1713446400000,
    "updatedAt": 1713446400000
  }
}
```

**Error Codes:**

- `404 NOT_FOUND` — Service instance not found

---

#### `PUT /config/services/{id}`

Update a service instance. Secret fields can be omitted to preserve existing values.

**Request Body:**

```json
{
  "config": {
    "onionUrl": "http://new-onion.onion",
    "rpcUser": "newuser",
    "rpcPassword": ""
  }
}
```

**Request Schema:**

```typescript
{
  config: Partial<Record<string, any>>  // Partial config; unknown fields preserved
}
```

**Secret Field Handling:**

- If a secret field is omitted: existing encrypted value preserved
- If a secret field is `""` (empty string): existing value preserved
- If a secret field has a value: encrypted and stored

**Response:**

Same as `GET /config/services/{id}`. Also emits `config:service.updated` event (WebSocket broadcast).

**Error Codes:**

- `400 VALIDATION` — Invalid per kind schema after merge with existing config
- `404 NOT_FOUND` — Service instance not found

---

#### `DELETE /config/services/{id}`

Delete a service instance.

**Response:**

```json
{
  "data": null
}
```

Also emits `config:service.deleted` event and pauses/resumes poller. Audit trail recorded.

**Error Codes:**

- `404 NOT_FOUND` — Service instance not found

---

### Test Connection

#### `POST /config/services/{id}/test`

Validate credentials by attempting a health check with provided (or existing) config.

**Request Body:**

```json
{
  "config": {
    "onionUrl": "http://example.onion",
    "rpcUser": "bitcoinrpc",
    "rpcPassword": "secret123"
  }
}
```

**Request Schema:**

```typescript
{
  config?: Record<string, any>  // If omitted, uses current saved config
}
```

**Response:**

```json
{
  "data": {
    "success": true,
    "message": "Connection successful",
    "details": {
      "reachable": true,
      "latencyMs": 123,
      "blockHeight": 654321
    }
  }
}
```

**Error Response (on failure):**

```json
{
  "data": {
    "success": false,
    "message": "Connection failed: Connection timeout",
    "details": null
  }
}
```

**TestConnectionResult Schema:**

```typescript
{
  success: boolean              // true if health check passed
  message: string               // Human-readable status
  details?: Record<string, any> // Service-specific details on success
}
```

---

### Backup & Restore

#### `GET /config/export`

Export all service configurations as an encrypted bundle.

**Response:**

```json
{
  "data": {
    "version": 1,
    "exportedAt": "2026-04-19T10:30:00Z",
    "payload": "base64_encoded_aes_256_gcm_ciphertext"
  }
}
```

**ExportBundle Schema:**

```typescript
{
  version: 1                    // Bundle format version (always 1)
  exportedAt: string           // ISO 8601 timestamp of export
  payload: string              // Base64 AES-256-GCM encrypted JSON array of service configurations
}
```

**Details:**

- Encrypts all service configurations (including secrets) with `WATCHMAN_MASTER_KEY`
- Payload contains plaintext JSON array of all `app_service_instance` rows
- Use HTTP `Content-Disposition: attachment` to download as file
- Suitable for backup or migration to another Watchman instance with same master key

---

#### `POST /config/import`

Import a previously exported bundle. Upserts services by `(kind, instanceId)`.

**Request Body:**

```json
{
  "version": 1,
  "exportedAt": "2026-04-19T10:30:00Z",
  "payload": "base64_encoded_aes_256_gcm_ciphertext"
}
```

**Request Schema:**

```typescript
{
  version: 1                    // Bundle format version (must be 1)
  exportedAt: string           // Timestamp from export
  payload: string              // Base64 AES-256-GCM ciphertext
}
```

**Response:**

```json
{
  "data": {
    "imported": 5,
    "updated": 2,
    "skipped": 0,
    "errors": []
  }
}
```

**ImportResult Schema:**

```typescript
{
  imported: number             // New services created
  updated: number              // Existing services upserted
  skipped: number              // Services that already exist and no change
  errors: Array<{
    kind: string               // Service kind
    instanceId: string         // Instance ID
    message: string            // Error reason (e.g., validation failure)
  }>
}
```

**Behavior:**

- Validates bundle format and decrypts with `WATCHMAN_MASTER_KEY`
- For each service in bundle, looks up existing by `(kind, instanceId)`
- If exists and config unchanged: skipped
- If exists and config different: upserted
- If not exists: imported as new
- On error (e.g., validation), service is added to errors array; others continue
- Audit trail recorded with action `import`

**Error Codes:**

- `400 VALIDATION` — Invalid bundle format or decryption failed
- `400 MISMATCH` — Bundle was encrypted with different master key

---

### Audit Log

#### `GET /config/audit`

Fetch audit trail of configuration changes.

**Query Parameters:**

| Param    | Type   | Default | Description           |
|----------|--------|---------|----------------------|
| `limit`  | number | 50      | Max entries           |
| `offset` | number | 0       | Pagination offset     |
| `kind`   | string | -       | Filter by service kind|

**Response:**

```json
{
  "data": [
    {
      "id": "audit-uuid",
      "timestamp": 1713446400000,
      "action": "create",
      "serviceId": "bitcoin:main",
      "serviceKind": "bitcoin",
      "actor": "admin",
      "diffRedacted": {
        "added": {
          "name": "Main Bitcoin Node",
          "config_public": { "rpcPort": 8332 }
        }
      },
      "notes": null
    },
    {
      "id": "audit-uuid-2",
      "timestamp": 1713446500000,
      "action": "update",
      "serviceId": "bitcoin:main",
      "serviceKind": "bitcoin",
      "actor": "admin",
      "diffRedacted": {
        "changed": {
          "config_public.rpcPort": [8332, 8333]
        }
      },
      "notes": null
    },
    {
      "id": "audit-uuid-3",
      "timestamp": 1713446600000,
      "action": "delete",
      "serviceId": "qbittorrent:1",
      "serviceKind": "qbittorrent",
      "actor": "admin",
      "diffRedacted": {
        "removed": {
          "id": "qbittorrent:1",
          "name": "qBittorrent (Office)"
        }
      },
      "notes": "Decommissioned"
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 50,
    "offset": 0
  }
}
```

**AuditEntry Schema:**

```typescript
{
  id: string                    // Audit entry ID
  timestamp: number            // When change occurred (ms)
  action: 'create' | 'update' | 'delete' | 'import' | 'export'
  serviceId: string            // Service instance ID
  serviceKind: string          // Service kind
  actor: string                // Who made the change (e.g., "admin")
  diffRedacted: Record<string, any> // {added, changed, removed} with secrets masked
  notes?: string               // Optional notes (e.g., reason for deletion)
}
```

**Redaction Rules:**

- Secret fields shown as `"***"` in diffs
- `config_secret` BLOB never exposed in audit log
- Service URLs and usernames visible; passwords masked

---

## OpenAPI Specification

The complete specification is defined in [[apps/backend/openapi.yaml]]:

- `SetupStatus` — Setup wizard status
- `KindSchema` — Service kind with schema + field metadata
- `ServiceInstance` — Configured service instance
- `ServiceInstanceInput` — Create/update request
- `TestConnectionResult` — Test connection response
- `AuditEntry` — Audit log entry

See [[apps/backend/openapi.yaml]] for complete schema definitions with constraints and examples.

---

## Error Handling

All errors follow the standard [[docs/api/index|API error envelope]]:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

**Common Error Codes:**

| Code         | HTTP | Meaning                                    |
|--------------|------|--------------------------------------------|
| `VALIDATION` | 400  | Config fails per-kind schema validation    |
| `NOT_FOUND`  | 404  | Service instance not found                 |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token              |
| `CONFLICT`   | 409  | Duplicate name or kind+instanceId          |
| `UNAVAILABLE`| 503  | Service unreachable (test-connection only)|

---

## Example Workflows

### Create a Service

```bash
curl -X POST http://localhost:3001/config/services \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<JWT>" \
  -d '{
    "kind": "bitcoin",
    "name": "Main Bitcoin Node",
    "config": {
      "onionUrl": "http://example.onion",
      "rpcUser": "bitcoinrpc",
      "rpcPassword": "secret123"
    }
  }'
```

### Test Connection Before Saving

```bash
curl -X POST http://localhost:3001/config/services/bitcoin:main/test \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<JWT>" \
  -d '{
    "config": {
      "onionUrl": "http://example.onion",
      "rpcUser": "bitcoinrpc",
      "rpcPassword": "secret123"
    }
  }'
```

### Update a Service (Preserve Secret)

```bash
curl -X PUT http://localhost:3001/config/services/bitcoin:main \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<JWT>" \
  -d '{
    "config": {
      "rpcPort": 8333
    }
  }'
```

The `rpcPassword` is preserved since it's not included in the PATCH.

### View Audit Log

```bash
curl http://localhost:3001/config/audit \
  -H "Cookie: token=<JWT>"
```

---

## Related Documentation

- [[docs/features/ui-configuration|UI Configuration Feature]] — Complete user guide
- [[docs/adr/015-ui-driven-service-configuration|ADR-015]] — Design rationale
- [[docs/api/index|API Overview]] — Response envelope, error codes
- [[docs/reference/environment-variables|Environment Variables]] — Master key setup
