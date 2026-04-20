---
title: UI-Driven Service Configuration
type: feature
status: active
date: 2026-04-20
tags: [feature, configuration, ui, setup-wizard, settings, duckdb, encryption, hot-reload, backup, export, import, crud, discoverability]
description: Runtime service configuration from the UI with encrypted secrets, audit trail, hot-reload without restart, backup/restore, and dashboard CRUD discoverability (add/edit/delete from dashboard detail sheet)
aliases: [ui config, configuration, settings, setup wizard, backup, restore, service management, crud]
---

# UI-Driven Service Configuration

> [!abstract] Summary
> Watchman services are now managed entirely from the UI rather than `.env`. Services are stored in DuckDB with AES-256-GCM encrypted secrets, audited on every change, and applied live without restart.

## Overview

Previously, adding or editing a service required editing `.env`, restarting the backend, and losing WebSocket connections. Now:

- **Setup Wizard** guides first-time admins through initial service registration
- **Services UI** provides CRUD interface for all configured services
- **Dynamic Forms** generated from per-kind Zod schemas with client-side validation
- **Encrypted Secrets** stored at rest using `WATCHMAN_MASTER_KEY` (32-byte base64)
- **Hot Reload** pauses polling, swaps instances, retracks, resumes — no restart needed
- **Audit Trail** logs every create/update/delete with redacted diffs and actor
- **Test Connection** validates credentials before saving

## Flow Diagrams

### Setup Wizard (First Boot)

```mermaid
flowchart TD
    A["Server boots"] --> B{"app_service_instance<br/>empty?"}
    B -->|Yes| C["Setup Mode"]
    B -->|No| D["Normal Mode"]
    
    C --> E["SetupWizard Page"]
    E --> F["Welcome Step"]
    F --> G{"User skips<br/>or starts?"}
    G -->|Skip| H["Dismiss wizard<br/>via localStorage"]
    G -->|Start| I["Kind Picker Step"]
    
    I --> J["Select service type<br/>from 13 kinds<br/>5 categories"]
    J --> K["Configure Step<br/>embedded ServiceEditor"]
    K --> L["Fill form fields<br/>from /config/kinds"]
    L --> M["Test connection<br/>optional"]
    M --> N["Save to DB<br/>encrypted secrets"]
    
    N --> O["Review Step"]
    O --> P{"User action?"}
    P -->|Add Another| I
    P -->|Finish| Q["Navigate to<br/>dashboard"]
    
    H --> R["Redirect to<br/>dashboard<br/>skip wizard"]
```

### Service Configuration Flow

```mermaid
flowchart TD
    A["User visits<br/>/settings/services"] --> B["Load services<br/>GET /config/services"]
    B --> C["Display list<br/>with status dots"]
    C --> D{"User action?"}
    
    D -->|Edit| E["Open dialog"]
    D -->|Create| E
    D -->|Delete| F["Confirm & DELETE"]
    
    E --> G["Load kind schemas<br/>GET /config/kinds"]
    G --> H["Render dynamic form"]
    H --> I["User fills fields"]
    I --> J["Optional:<br/>Test connection"]
    J --> K["Validate & POST/PUT"]
    K --> L["Service saved<br/>& hot-reloaded"]
    L --> M["Tile status updates<br/>via WS event"]
    
    F --> N["Audit logged"]
    K --> N
    N --> O["Timeline visible<br/>in Audit page"]
```

### Hot-Reload Process

```mermaid
sequenceDiagram
    participant UI as UI (Browser)
    participant API as API Server
    participant SL as ServiceLifecycle
    participant Poller as BackgroundPoller
    participant EB as EventBus
    participant WS as WebSocket
    
    UI ->> API: PUT /config/services/{id}
    API ->> API: Validate & encrypt secrets
    API ->> API: Persist to DuckDB
    API ->> EB: emit config:service.updated
    EB ->> SL: notify (via subscription)
    
    SL ->> Poller: pause()
    note over Poller: Allow in-flight polls to finish
    Poller -->> SL: paused
    
    SL ->> SL: await oldService.onStop()
    SL ->> SL: rebuild via ServiceFactory
    SL ->> SL: await newService.onStart()
    
    SL ->> Poller: retrack(service)
    SL ->> Poller: resume()
    
    SL ->> EB: emit service.config.applied
    EB ->> WS: broadcast event
    WS ->> UI: reduced event (no secrets)
    UI ->> UI: refresh tile & audit
```

## Core Components

### SetupWizard (`src/pages/setup/SetupWizard.tsx`)

**Multi-step wizard** served when no services are configured. Users can skip to dismiss (stored in localStorage) and re-enter from Settings.

**Steps** (4-step flow):
1. **Welcome** — Introduction and skip/start options
2. **Kind Picker** — Select from 13 service types across 5 categories (Network, Media, Bitcoin, Home Automation, Hardware)
3. **Configure** — Dynamic form (embedded `ServiceEditor`) with Zod validation and optional test-connection
4. **Review** — Summary of added services with "Add Another" or "Finish Setup" options

**Components** (`[[docs/components/setup-wizard|Setup Wizard Components]]`):
- `SetupWizard.tsx` — Main orchestrator (step/selectedKind/addedIds state)
- `WelcomeStep.tsx` — Onboarding intro
- `KindPickerStep.tsx` — Searchable, categorized service picker with lucide icons
- `KindCard.tsx` — Individual service card
- `ConfigureStep.tsx` — Embedded form via `ServiceEditor` (with `hideKind` and `hideCancel` props)
- `ReviewStep.tsx` — Added services summary with loop-or-finish logic
- `ProgressRail.tsx` — Visual progress indicator
- `setup.css` — Shell layout, grain background, responsive grid

**Dismissal** (`[[docs/components/use-setup-dismissal|useSetupDismissal Hook]]`):
- Hook manages localStorage key `watchman.setupDismissed`
- `dismiss()` writes "1" and sets state; `reset()` removes flag to re-enter
- Cross-tab sync via `storage` event
- `SetupGate` in `App.tsx` checks flag before showing wizard

**Design**:
- No env-based admin creds (single-user design — see [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]])
- Shell has grain background, brand sidebar, progress rail
- Responsive grid for kind cards (2 cols mobile, 3 cols desktop)
- Each step fades in; back/next navigate between steps with state preservation

### Services UI (`src/pages/Settings/Services.tsx`)

Flat list of configured services:

- Status dot (green/red) for health
- Toggle to enable/disable (not yet implemented; phase 2)
- Edit button → opens `ServiceEditor` dialog
- Delete button → confirms & calls API

Uses `useServices()` and `useDeleteService()` mutations.

### ServiceEditor (`src/pages/Settings/ServiceEditor.tsx`)

Dynamic form driven by `/config/kinds` schemas with filtering and collapsible advanced settings:

- **Per-kind Zod schema** defines field types, validation, and UI metadata
- **Field types**: `text`, `password`, `number`, `boolean`, `url`, `select`, `stringArray`, `numberArray`
- **Field metadata**: `label`, `type`, `secret`, `required`, `placeholder`, `help`, `options`, `default`
- **Chrome fields** (instanceId, enabled, cacheTtlMs, timeoutMs, pollPolicy) filtered into "Advanced" `<details>` collapsible
- **Kind-specific fields** rendered in main form with required markers (`*`)
- **Array fields** (stringArray, numberArray) accept CSV input (e.g., "8080, 8443, 9000")
- **Default values** respect `FieldMeta.default`; fall back to type-based defaults if not specified
- **Secret fields** show `(saved — leave blank to keep)` on edit; empty values preserve existing
- **Test Connection** button validates credentials before save

Uses `useKinds()` to fetch schemas and `useCreateService()` / `useUpdateService()` to save. See [[docs/components/service-editor|ServiceEditor documentation]] for complete field handling, defaults, and array support.

### Audit Timeline (`src/pages/Settings/Audit.tsx`)

Chronological log of config changes:

- Each audit entry shows: timestamp, action (create/update/delete/import/export), service, actor, redacted diff
- Timeline format with expandable diffs
- Sorted descending by timestamp

Uses `useAudit()` query.

### Backup & Restore (`src/pages/Settings/BackupRestore.tsx`)

Enables admins to export and import service configurations:

- **Export**: Download encrypted bundle of all service configurations (AES-256-GCM with master key)
  - Button: "Download Backup"
  - Response: JSON file with `.watchman-backup` extension
  - Suitable for backup, migration, or disaster recovery
  
- **Import**: Upload a previously exported bundle
  - File picker and drag-and-drop support
  - Validates bundle format and decryption
  - Shows progress: imported, updated, skipped, and errors
  - Audit trail recorded with action `import`

Uses `useExportConfig()` and `useImportConfig()` mutations from `configApi.ts`.

## Backend Architecture

### ConfigStore (`src/config/store/ConfigStore.ts`)

DuckDB-backed CRUD:

- **Tables**:
  - `app_service_instance`: `id`, `kind`, `name`, `config_public` (JSON), `config_secret` (BLOB), `enabled`, `created_at`, `updated_at`
  - `app_config_audit`: `id`, `timestamp`, `action` (create/update/delete/import), `service_id`, `service_kind`, `diff_redacted`, `actor`, `notes`

- **Methods**:
  - `loadAll()` → Promise<ServiceInstance[]>
  - `findById(id)` → Promise<ServiceInstance | null>
  - `create(kind, name, configPublic, configSecret)` → Promise<ServiceInstance>
  - `update(id, configPublic, configSecret)` → Promise<ServiceInstance>
  - `delete(id)` → Promise<void>
  - `addAuditEntry(action, serviceId, diffRedacted, actor, notes)` → Promise<void>
  - `getAuditLog(limit, offset)` → Promise<AuditEntry[]>

- **Emits**: `config:service.{created,updated,deleted}` events on the event bus

### Encryption (`src/config/store/encryption.ts`)

AES-256-GCM with master key:

- **Key**: `WATCHMAN_MASTER_KEY` env (32 bytes, base64-decoded at boot)
- **Layout**: `IV(12) || TAG(16) || ciphertext`
- **Functions**:
  - `encrypt(plaintext: string): Buffer` → IV || TAG || ciphertext
  - `decrypt(encrypted: Buffer): string` → plaintext or throw
- **Error Handling**: Loss of master key makes secrets unrecoverable; documented in setup wizard and `.env.example`

### Per-Kind Schemas (`src/config/schemas/`)

One file per service kind; example structure:

```typescript
// src/config/schemas/bitcoin.ts
import { z } from 'zod'

export const BitcoinConfigSchema = z.object({
  onionUrl: z.string().url(),
  rpcUser: z.string(),
  rpcPassword: z.string(),
  rpcPort: z.number().int().default(8332),
})

export const BitcoinFieldMeta = [
  { name: 'onionUrl', label: 'Onion Address', type: 'text', required: true, help: 'Tor hidden service URL' },
  { name: 'rpcUser', label: 'RPC User', type: 'text', required: true },
  { name: 'rpcPassword', label: 'RPC Password', type: 'password', secret: true, required: true },
  { name: 'rpcPort', label: 'RPC Port', type: 'number', required: false, placeholder: '8332' },
]

export type BitcoinConfig = z.infer<typeof BitcoinConfigSchema>
```

Schemas are re-exported from `src/config/schemas/index.ts` and used:

- **Backend API**: `/config/kinds` returns all schemas with field metadata
- **Frontend**: `ServiceEditor` uses metadata to render form fields
- **Validation**: Zod schemas validate on both client and server

### ServiceLifecycle (`src/application/ServiceLifecycle.ts`)

Orchestrates hot-reload on config change:

```typescript
// Subscription to config events
eventBus.on('config:service.created', async (event) => {
  const service = await ServiceFactory.createService(event.kind, event.config, infra)
  
  // Mutex: serialize config changes
  await configMutex.runExclusive(async () => {
    poller.pause()
    try {
      service.onStart?.()
      serviceRegistry.register(service)
      poller.retrack(service)
    } finally {
      poller.resume()
    }
  })
  
  eventBus.emit('service.config.applied', { id: service.id })
})
```

### ServiceFactory (`src/config/ServiceFactory.ts`)

Pure function to instantiate a service from config:

```typescript
export function createService(kind: string, config: Record<string, any>, infra: Infrastructure): BaseService {
  const ServiceClass = serviceRegistry.get(kind)
  if (!ServiceClass) throw new Error(`Unknown service kind: ${kind}`)
  
  return new ServiceClass({ ...config, infra })
}
```

No longer reads env; all config comes from caller.

### Poller Updates (`src/infra/scheduler/poller.ts`)

New methods to support hot-reload:

- `pause()` → Stops polling; in-flight requests allowed to finish
- `resume()` → Resumes polling after pause
- `untrack(id: string)` → Removes service from tracking
- `retrack(service: BaseService)` → Re-adds service to tracking (e.g., after config change)

### API Routes

#### `GET /setup/status`

Returns setup state:

```json
{
  "data": {
    "needsSetup": false,
    "hasServices": true,
    "adminConfigured": true
  }
}
```

#### `GET /config/kinds`

Returns all service kind schemas with field metadata:

```json
{
  "data": {
    "bitcoin": {
      "schema": { /* Zod schema serialized */ },
      "fields": [
        { "name": "onionUrl", "label": "...", "type": "text", ... }
      ]
    },
    ...
  }
}
```

#### `GET /config/services`

List all configured services (secrets masked):

```json
{
  "data": [
    {
      "id": "bitcoin:1",
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
  ]
}
```

#### `POST /config/services`

Create a new service (flat discriminated union, not nested):

```json
{
  "kind": "bitcoin",
  "instanceId": "main",
  "enabled": true,
  "cacheTtlMs": 10000,
  "timeoutMs": 5000,
  "onionUrl": "...",
  "rpcUser": "...",
  "rpcPassword": "..."
}
```

Response: As above.

#### `PUT /config/services/{id}`

Update service config (flat; secrets optional on edit):

```json
{
  "cacheTtlMs": 12000,
  "onionUrl": "...",
  "rpcPassword": "" // Omit entirely or leave empty = keep existing
}
```

#### `DELETE /config/services/{id}`

Delete service:

```
DELETE /config/services/bitcoin:1
```

#### `POST /config/services/{id}/test`

Test connection with provided credentials (flat config fields):

```json
{
  "onionUrl": "...",
  "rpcUser": "...",
  "rpcPassword": "..."
}
```

Response:

```json
{
  "data": {
    "success": true,
    "message": "Connection successful",
    "details": { /* service-specific */ }
  }
}
```

#### `GET /config/export`

Export all service configurations as encrypted bundle:

```json
{
  "data": {
    "version": 1,
    "exportedAt": "2026-04-19T10:30:00Z",
    "payload": "base64_aes256gcm_ciphertext"
  }
}
```

#### `POST /config/import`

Import a previously exported bundle:

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

#### `GET /config/audit`

List audit log entries (query params: `?limit=50&offset=0`):

```json
{
  "data": [
    {
      "id": "...",
      "timestamp": 1713446400000,
      "action": "create",
      "serviceId": "bitcoin:1",
      "serviceKind": "bitcoin",
      "actor": "admin",
      "diffRedacted": "{ added: { name: 'Main Bitcoin Node' } }",
      "notes": null
    }
  ]
}
```

## Master-Key Provisioning

The master key for AES-256-GCM secret encryption is now provisioned by the backend itself on first boot:

- **Location**: `[[apps/backend/src/config/masterKey.ts|masterKey.ts]]` loaded during backend bootstrap
- **File location**: `{DATA_DIR}/master.key` (e.g., `/home/pi/.watchman/data/master.key` on Pi, or `<userData>/data/master.key` in Electron)
- **Permissions**: Mode 0600 (owner read/write only)
- **Auto-generation**: On first boot, if the file does not exist, generates 32 random bytes, base64-encodes, and writes to disk
- **Environment override**: If `WATCHMAN_MASTER_KEY` env var is set, uses that instead of the file (useful for containerized deployments)
- **Backend integration**: Called from `[[apps/backend/src/index.ts|index.ts]]` during bootstrap before any secret-encrypting consumer initializes

This moves master-key responsibility from the Electron main process (old model) to the backend itself, making it work identically on Raspberry Pi, Mac dev, or any other deployment.

## Environment Variables

### Updated

| Variable           | Description                                      | Required | Example / Default                         |
| ------------------ | ------------------------------------------------ | -------- | ----------------------------------------- |
| `WATCHMAN_MASTER_KEY` | AES-256-GCM key for encrypting secrets (base64, optional override) | No       | `Z0VzN3AxMHBXZ3UyaDR...` (32 bytes, base64); auto-provisioned at `{DATA_DIR}/master.key` if not set |

### Removed

- `ENABLED_SERVICES` — Use UI instead
- `WATCHMAN_SERVICES_CONFIG` — Use UI instead
- All per-kind service env vars (`*_URL`, `*_USERNAME`, `*_PASSWORD`, etc.) — Migrated to DB on first boot via `envMigrator`

### Legacy Migration

On first boot with existing `.env`, `envMigrator` runs:
- Scans for legacy `*_MAIN_*`, `*_1_*`, etc. env vars
- Creates `app_service_instance` rows with `config_public` + `config_secret` (encrypted)
- Adds audit entry with action `import`
- Logs warning on subsequent boots if legacy vars still present

Admins should remove legacy service env vars from `.env` after first boot.

## Dashboard CRUD Discoverability (Phase 3)

The bento dashboard (Phase 3, live behind `?bento=1`) integrates service configuration directly into the main dashboard experience, eliminating the need to visit Settings for quick edits:

### Add Service Entry Points

**Header Button**
- Right-aligned "+ Add service" button in dashboard header
- Always visible for quick access
- Opens `ServiceEditor` in create mode within a dialog
- Kind selector visible; user selects service type and fills config

**Empty State Button**
- When no services are configured, dashboard shows styled "Add your first service" button
- Clicking opens the same create editor dialog
- Introduces setup flow without leaving dashboard context

### Service Detail Sheet Controls (Footer)

When user clicks a service tile:

1. **Right-anchored sheet opens** with metrics, charts, and controls

2. **Enable/Disable Toggle** — Checkbox/button in footer
   - Instantly toggles service enabled state via `useUpdateService` mutation
   - Sheet remains open; disabled badge appears in header
   - No form required; single-click operation

3. **Edit Button** — Enters edit mode
   - Body switches from tabs (metrics/charts) to inline `ServiceEditor` form
   - Pre-populated with current service config
   - Kind field hidden; cannot change service type in place
   - Advanced fields (cache TTL, timeout, polling) shown in collapsible
   - Save button calls update mutation; Cancel returns to detail view

4. **Delete Button** (Destructive Styling)
   - Opens `ConfirmDialog` with destructive variant (`--crit` color)
   - Confirmation message includes service name
   - On confirm: calls `useDeleteService` mutation
   - Sheet closes on success
   - Success feedback via toast notification (optional)

### Settings Page Parity

The Settings → Services page retains the full service list view with status dots and bulk operations:

- List of all configured services
- Status indicators (online/offline/warning)
- Inline delete button with `ConfirmDialog` confirmation
- Edit button opens form in modal
- Matches footer controls from detail sheet for consistency

### Benefits

- **Discoverability**: Services are configurable from the main dashboard, not hidden in Settings
- **Quick Edits**: Enable/disable and edit form accessible without leaving service context
- **Destructive Operations**: Clear visual warning (red button, confirmation dialog) for deletions
- **Consistency**: Detail sheet, bento dashboard, and settings all use same `ServiceEditor` and `ConfirmDialog` components
- **Flow Integration**: Create → see on dashboard → edit/delete inline, no back-and-forth to Settings

## Security Considerations

> [!warning] Master Key Loss
> If `WATCHMAN_MASTER_KEY` is lost or rotated, all encrypted secrets become unrecoverable. Admins must re-enter credentials. Store the key securely in your deployment (secrets vault, encrypted environment, etc.).

### Secret Handling

- Secrets encrypted with AES-256-GCM; plaintext never persisted
- GET responses redact secret fields to `"***"`
- Frontend forms show `(saved — leave blank to keep)` on edit
- On submit, omitted/empty secret fields preserve existing value
- `POST /config/services/{id}/test` executes with plaintext but doesn't persist

### Audit Trail

- Every mutation logged to `app_config_audit`
- Diffs redacted (secret fields shown as `"***"` in audit)
- Actor field for future multi-admin support
- Audit log visible in UI timeline

## Related Documentation

- [[docs/adr/015-ui-driven-service-configuration|ADR-015]] — Design decision
- [[docs/components/bento-dashboard|BentoDashboard]] — Dashboard with add-service entry points
- [[docs/components/service-detail-sheet|ServiceDetailSheet]] — Detail view with edit/delete footer controls
- [[docs/components/service-editor|ServiceEditor]] — Dynamic form component for create/edit
- [[docs/components/primitives/confirm-dialog|ConfirmDialog]] — Deletion confirmation dialog
- [[docs/api/config|API Documentation]] — Complete endpoint reference
- [[docs/architecture/backend-architecture|Backend Architecture]] — ServiceFactory, ServiceLifecycle, ConfigStore
- [[docs/architecture/frontend-architecture|Frontend Architecture]] — Settings pages, SetupWizard, BentoDashboard
- [[docs/reference/environment-variables|Environment Variables]] — Master key setup
