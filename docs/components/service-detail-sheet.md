---
title: ServiceDetailSheet Component
type: component
status: active
date: 2026-04-19
tags: [component, bento, sheet, modal, detail-view, frontend, phase3, crud, edit, delete]
description: Right-anchored detail sheet for service inspection, editing, and deletion. Displays tabbed metric groups, charts placeholder, service controls, and inline form editing.
aliases: [ServiceDetailSheet, detail sheet, service details, service editor]
---

# ServiceDetailSheet Component

> [!abstract] Overview
> `ServiceDetailSheet` provides a detailed drill-down view for each service with full CRUD affordances. Opens from the right side of the screen, displaying tabbed metric groups, charts placeholder (Phase 5), service controls (enable/disable), and inline edit mode. Driven entirely by the `ServiceRenderer` registry.

## Location

`[[apps/frontend/src/components/detail/ServiceDetailSheet.tsx]]`

## Props

```typescript
interface ServiceDetailSheetProps {
  kind?: ServiceKind;
  instanceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

## State Management

### View Mode

```typescript
type ViewMode = "detail" | "edit";

const [view, setView] = useState<ViewMode>("detail");
```

- **`detail`** (default) — Shows tabbed metrics and chart placeholders; footer displays service controls
- **`edit`** — Replaces sheet body with inline `ServiceEditor` form (see [[docs/components/service-editor|ServiceEditor]] docs)

On sheet close (`open=false`), view resets to `"detail"`.

## Structure

### Header

- Service icon/status dot
- Service display name (from renderer)
- Status badge (online/warning/error/offline)
- Optional **disabled badge** — Shows when service exists and `enabled === false`
- Primary metric value and unit

### Tabs (Detail View Only)

1. **Metrics** — Detail sheet metric groups from `renderer.detail`
2. **Charts** — Chart specs from `renderer.charts` (Phase 5 placeholder: "History chart coming in Phase 5")

When `view === "edit"`, tabs are hidden and the body is replaced entirely with the form.

### Metrics Tab

Renders `renderer.detail` metric groups as tabbed sections:

```typescript
detail: [
  {
    title: "Network",
    metrics: [
      { key: "peers", label: "Peers", format: String },
      { key: "fee_rate", label: "Fee Rate (sat/vB)", format: (v) => v.toFixed(2) },
    ]
  },
  {
    title: "Mempool",
    metrics: [
      { key: "mempool.txs", label: "Transactions", format: String },
      { key: "mempool.bytes", label: "Size", format: formatBytes },
    ]
  }
]
```

Each group renders as a 2-column definition list:

```
Network
  Peers: 12
  Fee Rate: 42.50 sat/vB

Mempool
  Transactions: 3,421
  Size: 1.2 MB
```

Uses `Geist Mono` with `tabular-nums` for numeric alignment.

### Charts Tab (Phase 5 Placeholder)

Currently shows:

```
History chart coming in Phase 5
```

When Phase 5 completes:
- Render `renderer.charts` list
- Use visx `AreaClosed` for line charts
- Range picker: 1h / 24h / 7d / 30d
- Display current value + trend line

### Footer (Detail View Only)

Sheet footer displays service controls when `view === "detail"`:

**Buttons** (right-aligned):

1. **Enable/Disable Toggle** — Checkbox or button-like toggle
   - Calls `useUpdateService().mutateAsync({ enabled: !current.enabled })`
   - Updates without leaving detail view
   - Toggles the disabled badge in header

2. **Edit Button** — Sets `view = "edit"`
   - Replaces body with inline `ServiceEditor`
   - Pre-populates with current service config
   - `existing={service}` prop triggers edit mode behavior

3. **Delete Button** (destructive, red)
   - Opens [[docs/components/primitives/confirm-dialog|ConfirmDialog]]
   - `destructive={true}` for visual warning
   - `pending={deleteMut.isPending}` for async state
   - On confirm: `useDeleteService().mutateAsync(service.id)`
   - Closes sheet on success

4. **Close Button** — Closes sheet (`onOpenChange(false)`)

### Edit Mode (Inline Form)

When `view === "edit"`:

```tsx
<ServiceEditor
  existing={service}
  onSubmit={async (input) => {
    await updateMut.mutateAsync(input);
    setView("detail");
  }}
  onCancel={() => setView("detail")}
  submitting={updateMut.isPending}
/>
```

- Form inherits service id/kind
- Fields pre-filled from `service.config`
- "Save" button calls update mutation
- "Cancel" button returns to detail view
- On success, view resets to `"detail"`

## Rendering Details

### Font Stack

- **Headers**: Geist Variable (sans) — dark-luxury branding
- **Metric Values**: Geist Mono Variable with `tabular-nums` — aligns decimals in columns

### Data Queries & Service Discovery

When `open=true` and `kind` is set:

1. **Service Lookup** — Fetch full `ServiceInstance` from `useServices()` by matching `kind` + `instanceId` (defaults to `"main"` when undefined)
   ```typescript
   const { data: services } = useServices();
   const service = services?.find(s => s.kind === kind && (s.instanceId || "main") === (instanceId || "main"));
   ```

2. **Health & Stats** — Query via renderer pattern
   ```typescript
   const { data: health } = useServiceHealth(kind);
   const { data: stats } = useServiceStats(kind);
   const renderer = getRenderer(kind);
   ```

3. **Nested Metric Access** — Uses `dotGet(stats, "path.to.metric")` from formatters to fetch nested metric values

4. **Service Control Mutations**:
   - `useUpdateService()` — Patch service config (e.g., toggle enabled)
   - `useDeleteService()` — Delete service by id

### Tone

Primary status indicator derived from `renderer.tone({ stats, health, instance })`.

## Animation

- Sheet slides in from right with easing curve
- Backdrop fade-in
- Respects `prefers-reduced-motion`

## Keyboard & A11y

- Esc to close
- Focus trap within sheet
- Title and description for screen readers
- Semantic heading/tab structure

## Responsive

- Desktop: Right-anchored, 40% viewport width (max 600px)
- Tablet: Same width, full height
- Mobile: Full-screen overlay (modal behavior)

## Integration with BentoDashboard

`BentoDashboard` manages open state and renderer selection:

```tsx
const [openCtx, setOpenCtx] = useState<OpenCtx | null>(null);

<ServiceDetailSheet
  kind={openCtx?.kind}
  instanceId={openCtx?.instanceId}
  open={!!openCtx}
  onOpenChange={(o) => o ? null : setOpenCtx(null)}
/>
```

On ServiceTile click → `onOpenDetail({ kind, instanceId })` → updates `openCtx` → sheet opens.

## Multi-Instance Support

If `instanceId` is provided:
- Queries use `useServiceHealth(kind, instanceId)` + `useServiceStats(kind, instanceId)`
- Sheet title may append instance number (e.g., "Bitcoin #2")

## Example Metric Groups

### Bitcoin

```
Network
  Peers: 12
  Relay: 542
  Fee Rate: 45.32 sat/vB

Mempool
  Transactions: 5,421
  Size: 2.1 MB
  Min Fee: 1.5 sat/vB
```

### Synology

```
System
  CPU: 35%
  Memory: 8.2 GB / 16 GB
  Uptime: 127 days

Storage
  HDD 1: 2.5 TB / 4 TB
  HDD 2: 1.8 TB / 4 TB
```

## Loading States

While queries load:
- Skeleton placeholders for metrics
- Spinner in chart area
- Header content hidden until `health` arrives

## Error States

If service is offline or unreachable:
- Badge shows "offline" or "error"
- Metric values show `—` (em-dash)
- Charts tab still renders (Phase 5: no data)

## Related

- [[docs/components/service-tile|ServiceTile]] — Triggering detail sheet open
- [[docs/components/service-editor|ServiceEditor]] — Inline form in edit mode
- [[docs/components/primitives/confirm-dialog|ConfirmDialog]] — Delete confirmation
- [[docs/components/dashboard-grid|DashboardGrid]] — Layout container
- [[docs/components/bento-dashboard|BentoDashboard]] — Parent orchestrator
- [[docs/services/renderers/index|Renderer Registry]] — Detail view specs
- [[docs/components/primitives/sheet|Sheet Primitive]] — Modal wrapper
- [[docs/api/config|Configuration API]] — Service CRUD endpoints
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
