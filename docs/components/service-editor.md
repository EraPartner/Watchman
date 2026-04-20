---
title: ServiceEditor Component
type: component
status: active
date: 2026-04-19
tags: [component, frontend, form, configuration, setup-wizard, dynamic-form, validation]
description: Dynamic form component for creating and editing service instances with field filtering, advanced settings, and array support
aliases: [service editor, service configuration form, dynamic form]
---

# ServiceEditor Component

> [!abstract] Overview
> **ServiceEditor** is a reusable dynamic form component for creating and editing service instances. It renders fields from `/config/kinds` schemas, filters framework fields into an "Advanced" collapsible, supports array field types (CSV input), and enforces per-kind schema validation.

## File

[[apps/frontend/src/pages/Settings/ServiceEditor.tsx]]

## Props

```typescript
interface ServiceEditorProps {
  existing?: ServiceInstance              // For editing: pre-populate form
  presetKind?: string                     // Pre-select service kind (for wizards)
  hideKind?: boolean                      // Hide kind selector (true when pre-selected)
  hideCancel?: boolean                    // Hide cancel button (true when in wizard)
  onSubmit: (input: ServiceInstanceInput) => Promise<void>
  onCancel: () => void
  submitting?: boolean                    // Show loading state during submission
}
```

## Features

### Field Filtering (Chrome vs. Kind-Specific)

ServiceEditor renders fields in two groups:

**Chrome Fields (Framework)** — Moved to "Advanced" collapsible:
- `instanceId` — Unique instance name (e.g., "main", "secondary", "office")
- `enabled` — Enabled/disabled toggle
- `cacheTtlMs` — Cache TTL in milliseconds (default 10,000)
- `timeoutMs` — Request timeout in milliseconds (default 5,000)
- `pollPolicy` — Per-kind polling behavior

These are **filtered out** from the main form and grouped in a `<details>` "Advanced" section. This prevents duplication and improves UX by separating operational concerns from credential/config fields.

**Kind-Specific Fields** — Rendered in main form:
- Per-kind schema defines the actual service configuration (e.g., `onionUrl`, `rpcUser`, `rpcPassword` for bitcoin)
- Required fields marked with red asterisk (`*`)
- Helper text displayed below label for `instanceId`, `cacheTtlMs`, `timeoutMs`

### Instance ID

- Prefilled to `"main"` on create
- Read-only on edit (immutable)
- Helper: "Unique name for this instance. Default 'main'."

### Advanced Collapsible

The `<details>` element groups framework fields:

```
<details>
  <summary>Advanced</summary>
  [Cache TTL, Timeout, Enabled toggle, pollPolicy...]
</details>
```

- Collapsed by default for cleaner UI
- User can expand to adjust polling behavior without affecting main form
- Each field has helper copy describing its purpose

### Default Field Values

Form respects `FieldMeta.default` when rendering initial values:

1. **On create** (no existing service):
   - If field has `default?: unknown` in metadata, use it
   - Else: type-based defaults (0 for number, "" for string, false for boolean, [] for arrays)

2. **On edit** (existing service):
   - Use existing value from `config`
   - If not present, fall back to metadata `default`
   - Then fall back to type-based defaults

Cache TTL and Timeout also check the `FieldMeta.default`:

```typescript
setCacheTtlMs(
  typeof existingCache === "number"
    ? existingCache
    : (cacheField?.default as number | undefined) ?? DEFAULT_CACHE_TTL_MS
);
```

### Array Field Types (CSV Input)

Supports `stringArray` and `numberArray` field types for comma-separated input:

```typescript
type FieldType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "url"
  | "password"
  | "select"
  | "stringArray"
  | "numberArray";
```

**Rendering:**
- `stringArray` and `numberArray` fields render as `<input type="text">` with label guidance
- User enters: `"8080, 8443, 9000"` (comma-separated)

**Parsing:**
- `parseCsv(input, numeric)` splits on commas, trims whitespace, filters empties
- For `numberArray`: converts to numbers, filters NaN

**Display:**
- `arrayToCsv(value)` joins arrays back to comma-separated string for display
- If value is already a string or undefined, returns as-is

Example (router ports):
```
Field: stringArray
Input: "8080, 8443, 9000"
Sent: ["8080", "8443", "9000"]
```

### Enabled Toggle

Checkbox for enabling/disabling the service without reconfiguring:

```
☑ Enabled
```

### Secret Field Handling

Secret fields (marked `secret: true` in metadata) behave specially:

**On Create:**
- Rendered as `<input type="password">`
- Placeholder: default or help text
- Sent to API as-is

**On Edit:**
- Rendered as `<input type="password">`
- Placeholder: `"(saved — leave blank to keep)"`
- If left blank or empty: omitted from request (preserves existing)
- If filled: new value sent (encrypted at rest)

Empty secret fields are **excluded** from the config payload:

```typescript
if (f.secret && (v === "" || v === "***")) continue;
```

### Required Field Validation

Required fields marked with red asterisk and validated on submit:

```typescript
if (v === "" && !f.required) continue;
if (Array.isArray(v) && v.length === 0 && !f.required) continue;
```

Empty required fields block submission with error message.

### Test Connection Button

Optional "Test Connection" button (shown on edit):

- Calls `POST /config/services/{id}/test` with current config
- Shows inline result: `"OK (45ms)"` or `"Failed: Connection timeout"`
- Does not save; for validation only

### Error Display

Form-level error message displayed if:
- Missing required fields
- Validation fails on submit
- API returns 400/409 error

Error from API response is extracted via `extractApiError` utility, which unwraps `{ error: { code, message } }` nested objects.

## Form Data Flow

1. **Load** (`useEffect`):
   - Fetch `/config/kinds` with `useKinds()`
   - Find schema for selected kind
   - Populate initial values from existing service or defaults

2. **Render**:
   - Filter fields by `COMMON_FIELD_NAMES`
   - Render instanceId, enabled, kind (if visible)
   - Render kind-specific fields (FieldInput components)
   - Render Advanced collapsible with chrome fields

3. **Change**:
   - User edits field → update `values` state
   - User toggles advanced → toggle `advancedOpen` state
   - User changes enabled/instanceId → update respective state

4. **Submit**:
   - Validate required fields
   - Build config object (only kind-specific fields)
   - Call `onSubmit` with `ServiceInstanceInput`:
     ```typescript
     {
       kind,
       instanceId,
       enabled,
       cacheTtlMs,
       timeoutMs,
       config // merged with top-level by configApi.ts
     }
     ```
   - API flattens to top-level discriminated union before sending to backend

## FieldInput Component (Inline)

Each kind-specific field rendered by `FieldInput`:

```typescript
<FieldInput
  field={f}
  value={values[f.name]}
  onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
  secretPlaceholder={
    existing && f.secret ? "(saved — leave blank to keep)" : undefined
  }
/>
```

Handles:
- `type: "text"` → `<input type="text">`
- `type: "password"` → `<input type="password">`
- `type: "number"` → `<input type="number">`
- `type: "boolean"` → `<input type="checkbox">`
- `type: "select"` → `<select>` with options
- `type: "stringArray"` / `type: "numberArray"` → `<input type="text">` with CSV parsing
- `type: "url"` → `<input type="url">`

## Integration

### With SetupWizard

The wizard's `ConfigureStep` embeds ServiceEditor:

```typescript
<ServiceEditor
  presetKind={kind}
  hideKind={true}
  hideCancel={true}
  onSubmit={handleCreate}
  onCancel={onBack}
/>
```

### With Settings Pages

The settings/services page uses ServiceEditor in a modal dialog:

```typescript
<ServiceEditor
  existing={serviceToEdit}
  onSubmit={handleUpdate}
  onCancel={closeDialog}
  submitting={isUpdating}
/>
```

### API Request Flattening

`configApi.ts` transforms the `ServiceInstanceInput` before sending to the backend:

```typescript
async createService(input: ServiceInstanceInput): Promise<ServiceInstance> {
  const { config, ...rest } = input;
  const body = { ...rest, ...(config ?? {}) };
  return sharedCore.request(`${BASE}/config/services`, jsonBody(body));
}
```

This flattens nested `config` into a top-level discriminated union matching the backend's `ServiceInstanceSchema`.

## Related

- [[docs/components/setup-wizard|Setup Wizard Components]] — Uses ServiceEditor in ConfigureStep
- [[docs/features/ui-configuration|UI Configuration Feature]] — Overview of service management flow
- [[docs/api/config|Configuration API]] — API contract and examples
- [[docs/components/index|Components Index]]
