---
title: Tabs Primitive
type: component
status: active
date: 2026-04-18
tags: [primitive, tabs, navigation, interactive, radix]
description: Tab navigation wrapper around Radix Tabs
aliases: [tabs, Tabs]
---

# Tabs Primitive

Tab navigation built on [[https://www.radix-ui.com/docs/primitives/components/tabs|Radix Tabs]] for switching between content sections.

## Purpose

Organize related content into switchable tabs with keyboard navigation and ARIA semantics.

## Components

| Component | Element | Purpose |
|-----------|---------|---------|
| `Tabs` | `Root` | Container, manages active tab |
| `TabsList` | `List` | Tab button container (flex row) |
| `TabsTrigger` | `Trigger` | Individual tab button |
| `TabsContent` | `Content` | Content panel for tab |

## Props

```typescript
interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}

interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string; // Unique identifier
  children: ReactNode;
}

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string; // Must match a TabsTrigger value
  children: ReactNode;
}
```

## Usage

```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/primitives";

<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="stats">Statistics</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
  </TabsList>

  <TabsContent value="overview">
    <p>Overview content here</p>
  </TabsContent>
  <TabsContent value="stats">
    <p>Stats content here</p>
  </TabsContent>
  <TabsContent value="settings">
    <p>Settings content here</p>
  </TabsContent>
</Tabs>
```

## Styling Details

- **List**: Flex row with bottom hairline border
- **Trigger**: Ghost button style, bottom accent on active
- **Active indicator**: `--accent` bottom border
- **Content**: Fade in on switch
- **Transition**: 150ms `--dur-fast`

## Keyboard Navigation

- **Tab**: Focus next trigger
- **Shift+Tab**: Focus previous trigger
- **Arrow keys**: Switch between tabs (depends on orientation)
- **Enter/Space**: Activate tab

## Accessibility

- **ARIA**: `role="tablist"` on list, `role="tab"` on triggers, `role="tabpanel"` on content
- **Selected**: `aria-selected="true"` on active trigger
- **Labeled**: Use `aria-label` if list lacks visible label
- **Keyboard**: Full keyboard navigation support

## Related

- [[docs/components/primitives/surface|Surface]] — Container for tab panels
- [[https://www.radix-ui.com/docs/primitives/components/tabs|Radix Tabs Docs]]
- [[apps/frontend/src/components/primitives/Tabs.tsx|Tabs.tsx]]
