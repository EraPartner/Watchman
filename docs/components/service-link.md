---
title: "Component: ServiceLink"
type: component
status: superseded
date: 2026-10-21
tags: [component, frontend, react, shared, navigation]
description: Reusable external link button for service web interfaces with URL normalization
aliases: [service link, external link button, url button]
---

# Component: ServiceLink

> [!warning] Superseded: removed from the code
> `ServiceLink.tsx` and `lib/url.ts` were removed as dead code (commit `8f289c2`). Tile quick links now come from `apps/frontend/src/services/renderers/quickLink.ts`. This page is kept as history.

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

## Test Coverage

- `[[apps/frontend/src/components/ServiceLink.test.tsx]]` covers `[[apps/frontend/src/components/ServiceLink.tsx]]` behavior:
  - missing `raw` URL path renders `N/A` and avoids URL helper calls
  - `hostOnly` display behavior renders host-focused label without using `formatDisplayUrl()`
  - click behavior opens the computed href via `openHref()`

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
- [[apps/frontend/src/components/ServiceLink.test.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
- [[apps/frontend/src/lib/url.ts|URL Utilities]]
