---
title: ServerStatusBadge Component
type: component
status: active
date: 2026-04-02
tags: [component, frontend, react, badge, status]
description: Reusable status badge component displaying online/offline/loading/warning/error/maintenance states with icons and colors
aliases: [status badge, server status, health badge]
---

# ServerStatusBadge

> [!abstract] Summary
> A small, reusable badge component that visually represents service status states with appropriate colors, icons, and labels.

## Overview

`ServerStatusBadge` is a foundational UI component used across all service cards to display the current health status of a service. It maps status strings to visual representations using shadcn/ui `Badge` components with Lucide icons.

## File Location

`[[apps/frontend/src/components/ServerStatusBadge.tsx]]`

## Props

| Prop     | Type                                                                          | Description          |
| -------- | ----------------------------------------------------------------------------- | -------------------- |
| `status` | `"online" \| "offline" \| "warning" \| "loading" \| "error" \| "maintenance"` | Current status state |

## Status Mappings

| Status        | Variant       | Color                  | Icon                   | Label       |
| ------------- | ------------- | ---------------------- | ---------------------- | ----------- |
| `online`      | `default`     | Green (`bg-green-500`) | `CheckCircle`          | Online      |
| `offline`     | `secondary`   | Gray                   | `Wifi`                 | Offline     |
| `warning`     | `destructive` | Red                    | `AlertCircle`          | Warning     |
| `error`       | `destructive` | Red                    | `AlertCircle`          | Error       |
| `loading`     | `secondary`   | Gray                   | `RefreshCw` (spinning) | Loading     |
| `maintenance` | `outline`     | Transparent            | `Wifi`                 | Maintenance |

## Behavior

- **Loading state** — Shows animated spinning icon
- **Online state** — Green badge with checkmark
- **Error/Warning states** — Red destructive variant with alert icon
- **Maintenance state** — Outlined badge with wifi icon
- **Default (offline)** — Falls through to offline display for unknown statuses

## Usage

```tsx
import { ServerStatusBadge } from "@/components/ServerStatusBadge";

<ServerStatusBadge status="online" />
<ServerStatusBadge status="loading" />
<ServerStatusBadge status="offline" />
```

## Used By

- [[docs/components/optimized-service-card|OptimizedServiceCard]]
- [[docs/components/performant-service-card|PerformantServiceCard]]
- All individual service cards (AdGuardCard, BitcoinCard, etc.)

## Dependencies

- `@/components/ui/badge` — shadcn/ui Badge component
- `lucide-react` — Icon library (CheckCircle, AlertCircle, RefreshCw, Wifi)
