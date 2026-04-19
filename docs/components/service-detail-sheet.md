---
title: ServiceDetailSheet Component
type: component
status: active
date: 2026-04-18
tags: [component, bento, sheet, modal, detail-view, frontend, phase3]
description: Right-anchored detail sheet for service inspection. Displays tabbed metric groups, charts placeholder, and primary metric with status. Opened from ServiceTile click.
aliases: [ServiceDetailSheet, detail sheet, service details]
---

# ServiceDetailSheet Component

> [!abstract] Overview
> `ServiceDetailSheet` provides a detailed drill-down view for each service. Opens from the right side of the screen, displaying tabbed metric groups, current-value charts (Phase 5), and status summary. Driven entirely by the `ServiceRenderer` registry.

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

## Structure

### Header

- Service icon/status dot
- Service display name (from renderer)
- Status badge (online/warning/error/offline)
- Primary metric value and unit

### Tabs

1. **Metrics** — Detail sheet metric groups from `renderer.detail`
2. **Charts** — Chart specs from `renderer.charts` (Phase 5 placeholder: "History chart coming in Phase 5")

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

## Rendering Details

### Font Stack

- **Headers**: Geist Variable (sans) — dark-luxury branding
- **Metric Values**: Geist Mono Variable with `tabular-nums` — aligns decimals in columns

### Data Queries

When `open=true` and `kind` is set:

```typescript
const { data: health } = useServiceHealth(kind);
const { data: stats } = useServiceStats(kind);
const renderer = getRenderer(kind);
```

Uses `dotGet(stats, "path.to.metric")` from formatters to fetch nested metric values.

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

- [[docs/components/service-tile|ServiceTile]]
- [[docs/components/dashboard-grid|DashboardGrid]]
- [[docs/components/bento-dashboard|BentoDashboard]]
- [[docs/services/renderers/index|Renderer Registry]]
- [[docs/components/primitives/sheet|Sheet Primitive]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]
