---
title: "Component: ServiceLink"
type: component
status: active
date: 2026-04-02
tags: [component, frontend, react, shared, navigation]
description: Reusable external link button for service web interfaces with URL normalization
aliases: [service link, external link button, url button]
---

# Component: ServiceLink

> [!abstract] Overview
> A reusable button component that renders an external link to a service's web interface with URL normalization, HTTPS preference, and an external link icon.

## Purpose

Provides a consistent way to display clickable links to monitored services' web UIs across all service card components. Handles URL formatting, protocol stripping for display, and opens links in new tabs.

## Props

| Prop          | Type             | Required | Default     | Description                                        |
| ------------- | ---------------- | -------- | ----------- | -------------------------------------------------- |
| `raw`         | `string \| null` | No       | `undefined` | Raw URL string (with or without protocol)          |
| `preferHttps` | `boolean`        | No       | `true`      | Whether to prefer HTTPS over HTTP                  |
| `title`       | `string`         | No       | `undefined` | HTML title attribute for the button                |
| `className`   | `string`         | No       | `""`        | Additional CSS classes                             |
| `compact`     | `boolean`        | No       | `false`     | Truncates display text with `truncate` class       |
| `hostOnly`    | `boolean`        | No       | `false`     | Strips protocol and path, showing only `host:port` |

## Behavior

- If `raw` is null/undefined, renders a muted "N/A" text
- Uses `buildHref()` from `[[apps/frontend/src/lib/url.ts]]` to construct a valid href
- Uses `formatDisplayUrl()` for display text (unless `hostOnly` is true)
- Strips protocol and path when `hostOnly` is true, showing only hostname
- Opens links via `openHref()` which handles new tab creation
- Renders a small external link icon (Lucide `ExternalLink`) next to the URL

## Usage Example

```tsx
import ServiceLink from "./ServiceLink";

// Standard usage
<ServiceLink raw="http://192.168.1.100:3000" title="Open AdGuard Home" />

// Compact mode for tight spaces
<ServiceLink raw="http://192.168.1.100:3000" compact />

// Show only hostname
<ServiceLink raw="http://192.168.1.100:3000/admin" hostOnly />
```

## Dependencies

- `lucide-react` — `ExternalLink` icon
- `[[apps/frontend/src/lib/url.ts]]` — `buildHref`, `formatDisplayUrl`, `openHref`

## Source

- [[apps/frontend/src/components/ServiceLink.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[apps/frontend/src/lib/url.ts|URL Utilities]]
