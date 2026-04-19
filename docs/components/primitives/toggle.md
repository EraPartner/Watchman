---
title: Toggle Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, toggle, interactive, radix]
description: Toggle button and toggle group for multi-select
aliases: [toggle, Toggle, ToggleGroup]
---

# Toggle Primitive

Toggle button and group wrapper around [[https://www.radix-ui.com/docs/primitives/components/toggle|Radix Toggle]].

## Purpose

Render a button that toggles between two states, with optional grouping for multi-select or exclusive selection.

## Components

| Component | Element | Purpose |
|-----------|---------|---------|
| `Toggle` | `Root` | Single toggle button |
| `ToggleGroup` | `Root` | Group of toggles (radio or checkbox mode) |

## Props

```typescript
interface ToggleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  children: ReactNode;
}

interface ToggleGroupProps extends HTMLAttributes<HTMLDivElement> {
  type: 'single' | 'multiple'; // exclusive or checkbox
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  children: ReactNode;
}

interface ToggleGroupItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string; // Unique identifier
  children: ReactNode;
}
```

## Usage

```typescript
import { Toggle, ToggleGroup } from "@/components/primitives";

// Single toggle
<Toggle pressed={isOn} onPressedChange={setIsOn}>
  Bold
</Toggle>

// Toggle group (exclusive radio-like)
<ToggleGroup type="single" value={view} onValueChange={setView}>
  <Toggle value="list">List</Toggle>
  <Toggle value="grid">Grid</Toggle>
  <Toggle value="map">Map</Toggle>
</ToggleGroup>

// Toggle group (checkbox-like multi-select)
<ToggleGroup type="multiple" value={filters} onValueChange={setFilters}>
  <Toggle value="online">Online</Toggle>
  <Toggle value="offline">Offline</Toggle>
  <Toggle value="updating">Updating</Toggle>
</ToggleGroup>
```

## Styling Details

- **Default**: Ghost style, `--text-md` text
- **Pressed**: `--surface-2` bg, `--text-hi` text
- **Transition**: 150ms `--dur-fast`
- **Focus**: 2px `--accent` ring
- **Radius**: `--r-2` (8px)

## Accessibility

- **ARIA**: `aria-pressed="true|false"` on toggle
- **Group ARIA**: `role="group"` on container
- **Keyboard**: Tab navigation, Space/Enter to toggle
- **Labels**: Button text or `aria-label` for icon toggles

## Related

- [[docs/components/primitives/button|Button]] — Static button
- [[https://www.radix-ui.com/docs/primitives/components/toggle|Radix Toggle Docs]]
- [[apps/frontend/src/components/primitives/Toggle.tsx|Toggle.tsx]]
