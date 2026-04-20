---
title: BentoDashboard Component
type: component
status: active
date: 2026-04-19
tags: [component, bento, dashboard, page, frontend, phase3, multi-instance, dynamic-layout, crud, add-service]
description: Main page component for the bento dashboard. Dynamic, instance-aware layout orchestrator combining DashboardGrid, ServiceTile, and ServiceDetailSheet. Includes header add-service button and empty-state discovery. Filters by configured service instances. Gated behind ?bento=1 query flag in Phase 3.
aliases: [BentoDashboard, bento page, dashboard page, add service]
---

# BentoDashboard Component

> [!abstract] Overview
> `BentoDashboard` is the Phase 3 flagship page component for the new bento-driven dashboard layout. It orchestrates the grid, tiles, and detail sheet, implementing state for which service is currently in focus. Currently live behind the `?bento=1` query flag; will become the default after Phase 6.

## Location

`[[apps/frontend/src/components/dashboard/BentoDashboard.tsx]]`

## Props

None. Designed as a page component (mounted directly in routing).

## Structure

```
BentoDashboard
├── TooltipProvider (context for primitives)
├── main
│   ├── header
│   │   ├── left: Label + h1
│   │   │   ├── Label: "Watchman · Bento"
│   │   │   └── h1: "Service dashboard"
│   │   └── right: "+ Add service" button → opens editor dialog
│   ├── [DashboardGrid OR empty-state]
│   │   ├── DashboardGrid
│   │   │   └── ServiceTile[] (filtered from BENTO_LAYOUT)
│   │   └── OR: "Add your first service" styled button → opens editor dialog
│   └── ServiceDetailSheet (for currently selected service)
├── CreateServiceEditor Dialog
│   └── ServiceEditor in create mode
```

## State Management

### View State

```typescript
type EditorState = { mode: "closed" } | { mode: "create" };

const [editorState, setEditorState] = useState<EditorState>({ mode: "closed" });
```

Tracks whether the service editor dialog is open in create mode. Used for both header "+ Add service" button and empty-state button.

### Detail Sheet Context

```typescript
interface OpenCtx {
  kind: ServiceKind;
  instanceId?: string;
}

const [openCtx, setOpenCtx] = useState<OpenCtx | null>(null);
```

Tracks which service detail sheet is currently open. Persists across tile re-renders.

### Service Instance Fetching

```typescript
const { data, isLoading } = useServiceInstances();
const configuredKinds = data?.instances ?? {};
```

Fetches the list of configured service instances from `/api/instances` endpoint. `configuredKinds` is a map of service kind → `{ count, instances }`.

### Layout Filtering

```typescript
const entries = BENTO_LAYOUT.filter(
  (e) => getRenderer(e.kind) && (configuredKinds[e.kind]?.count ?? 0) > 0,
);
```

Filters `BENTO_LAYOUT` entries by two criteria:
1. A renderer exists for the service kind
2. At least one instance of that kind is configured (count > 0)

Only services with both a renderer and at least one configured instance are included in the dashboard. This prevents 404 errors from rendering tiles for unconfigured services.

## Behavior

### Initial Load

1. `useServiceInstances()` fetches configured instances
2. Filters `BENTO_LAYOUT` by renderer existence and instance count
3. For each filtered entry, renders one `<ServiceTile>` per configured instance
4. Detail sheet closed (`openCtx = null`)

### Empty State

If no instances are configured (`entries.length === 0`), displays:

```
"Add your first service"
[Styled button]
```

Clicking the button opens the create service editor dialog (same as header "+ Add service" button). This replaces the grid entirely until at least one service instance is added.

### Header Add Service Button

Right-aligned button in the header:
```
[+ Add service]
```

Clicking opens the create service editor dialog. Always visible, even when services exist, for quick discoverability.

### Create Service Editor Dialog

When `editorState.mode === "create"`:

```tsx
<Dialog open={editorState.mode === "create"} onOpenChange={(o) => {
  setEditorState(o ? { mode: "create" } : { mode: "closed" });
}}>
  <DialogContent>
    <ServiceEditor
      presetKind={undefined}
      onSubmit={async (input) => {
        await createMut.mutateAsync(input);
        setEditorState({ mode: "closed" });
      }}
      onCancel={() => setEditorState({ mode: "closed" })}
    />
  </DialogContent>
</Dialog>
```

- Opened by: header "+ Add service" button **or** empty-state button
- `useCreateService()` mutation handles submission
- On success: closes dialog + queries invalidate → grid re-renders with new tile
- Kind selector visible (no `hideKind` prop)

### On Tile Click

- Tile calls `onOpenDetail({ kind, instanceId })`
- Updates `openCtx`
- Detail sheet opens with that service/instance's renderer

### On Sheet Close

- `onOpenChange(false)` → sets `openCtx = null`
- Sheet slides out

### On Service Change

- User can click a different tile (different kind or different instance of same kind)
- `openCtx` updates; sheet immediately shows new service/instance

## Styling

```tsx
<main className="min-h-screen bg-[var(--surface-0)] px-s-8 py-s-10 text-[var(--text-hi)]">
```

- **Background**: Design token `--surface-0` (darkest surface)
- **Text**: `--text-hi` (highest contrast text)
- **Padding**: `px-s-8` (horizontal spacing), `py-s-10` (vertical)

### Header

```tsx
<header className="mb-s-8 space-y-s-2">
  <p className="text-fs-label uppercase tracking-[0.12em] text-[var(--text-lo)]">
    Watchman · Bento
  </p>
  <h1 className="text-fs-h1 font-[700] tracking-[-0.02em]">
    Service dashboard
  </h1>
</header>
```

- **Label**: All-caps, letter-spaced, lower contrast
- **Heading**: H1, dark-luxury tracking-tight, bold weight

## Multi-Instance & Service Discovery

The dashboard is fully dynamic and instance-aware:

1. **Service Discovery** — Dashboard queries `/api/instances` on mount to discover all configured services
2. **Per-Service Sizing** — Layout uses `BENTO_LAYOUT` tile sizes; e.g., Bitcoin renders as XL, Synology as L
3. **Multiple Instances** — If a user configures 2 Bitcoin instances, the dashboard renders 2 XL tiles (one per instance)
4. **Renderer Requirement** — Only services with implemented renderers appear (Phase 3: Bitcoin, Synology; Phase 4+: all 14)

To add a new service to the dashboard:
1. Implement a renderer in `[[apps/frontend/src/services/renderers/{service}.ts]]` exporting a `ServiceRenderer` object
2. Export it from `[[apps/frontend/src/services/renderers/index.ts]]`
3. Add/update a layout entry in `[[apps/frontend/src/config/bentoLayout.ts]]` (sets tile size)
4. Configure an instance via Settings → the tile will appear on the dashboard

## Integration with App Routing

Currently mounted via lazy import in `[[apps/frontend/src/App.tsx]]`:

```typescript
const BentoDashboardPage = lazy(() =>
  import("@/components/dashboard/BentoDashboard")
);
```

Routed with:
```tsx
{
  path: "/?bento=1",  // Behind query flag in Phase 3
  element: <BentoDashboardPage />,
}
```

Will become the default dashboard (replacing `LiveServerDashboard`) after Phase 6 refactor.

## Accessibility

- Semantic HTML (main, header, nav hierarchy)
- TooltipProvider supplies ARIA context for all descendant tooltips
- ServiceTile and ServiceDetailSheet handle focus/keyboard
- Screen readers announce service names and status

## Performance

- **Lazy loading**: Component code-splits via React Router
- **Query deduping**: React Query caches health/stats queries; multiple tiles requesting same service share results
- **Memoization**: ServiceTile accepts `size` and `kind`; consider wrapping in `memo()` if re-renders become noisy

## Responsive Layout

- **Desktop (≥1024px)**: Full 12-col grid with varied tile sizes
- **Tablet (768px–1024px)**: 6-col grid; XL tiles collapse to L
- **Mobile (<768px)**: 1–2 col stack; all tiles become S

Detail sheet behavior:
- **Desktop/Tablet**: Right-anchored, 40–50vw width
- **Mobile**: Full-screen modal overlay

## Testing

- Unit tests planned for Phase 4: open/close state, filter logic, renderer dispatch
- Integration tests: tile interaction → sheet display flow
- E2E: Bento flag routing, tile click → sheet opens

## Related

- [[docs/components/service-tile|ServiceTile]] — Individual tiles triggering detail sheet
- [[docs/components/service-detail-sheet|ServiceDetailSheet]] — Detail view with edit/delete controls
- [[docs/components/service-editor|ServiceEditor]] — Create form in dialog
- [[docs/components/dashboard-grid|DashboardGrid]] — Grid layout
- [[docs/components/primitives/dialog|Dialog Primitive]] — Create service editor wrapper
- [[docs/config/bento-layout|Bento Layout Configuration]] — Tile sizing and filtering
- [[docs/services/renderers/index|Renderer Registry]] — Detail view specs
- [[docs/api/config|Configuration API]] — Service CRUD endpoints
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
