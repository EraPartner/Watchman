---
title: "ADR-028: Liquid-glass material + observability-card tiles"
type: adr
status: accepted
date: 2026-06-13
tags: [adr, frontend, design-system, bento, ui]
description: Adopt an Apple-inspired liquid-glass material layer and redesign service tiles as data-forward observability cards, keeping the dark-luxury cold-gold bento identity.
aliases: [glass tiles, observability cards, liquid glass, bento redesign]
---

# ADR-028: Liquid-glass material + observability-card tiles

> [!abstract] Summary
> Layer an Apple-style liquid-glass material system and a static "atmosphere"
> backdrop onto the existing dark-luxury bento, and redesign the service tile as
> a data-forward observability card (icon watermark + full-bleed signal chart +
> state-aware hero), without changing the palette, fonts, or grid.

## Status

- **Status**: Accepted
- **Date**: 2026-06-13

## Context

The bento dashboard ([[docs/adr/021-frontend-dashboard-upgrade|ADR-021]],
[[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014]]) read as flat
and sparse: opaque `surface-1` tiles with one metric floating top-left, two stats
pinned bottom, and a large empty middle. Sparklines rendered constant series (e.g.
`reachable`, idle download rate) as solid filled rectangles, and boolean hero
metrics formatted as a giant `true`/`yes` that looked like a rendering bug.

The maintainer wanted a more premium, "cool" feel — drawing on the Apple
glass/vibrancy aesthetic from a sibling project — **without** losing Watchman's
identity: cold-gold OKLCH palette, Geist mono labels, developer-console restraint,
and the bento grid. Chosen intensity: "balanced" glass + a "static gold wash"
atmosphere (no animated aurora, zero compositor cost).

## Decision

1. **Glass material layer** (`src/styles/glass.css`, tokens in `styles/tokens.css`):
   frosted `.glass-thin|regular|thick` + `.glass-topbar` utilities — translucent
   gradient + inset specular highlight + `backdrop-filter: blur() saturate()`. The
   `saturate()` is what makes the backdrop glow through rather than read as fog. On
   the near-black canvas the panels are tuned **lighter** than the page (~20–24% L
   over 14% L) so they read as surfaces, not transparency. `Surface` gained a
   `material="glass"` variant; `Dialog`/`Sheet` use `glass-thick`; `TopNav` uses
   `glass-topbar`.

2. **Static atmosphere** (`.atmosphere`, rendered once at the **App root** behind every
   route in `App.tsx`): a fixed gold radial wash + faint cool counter-wash + blueprint
   grid + film grain. This is what the glass refracts; without it `backdrop-filter` has
   nothing to catch. Page containers are transparent (the `body` paints `surface-0`), so
   the dashboard, settings, and 404 all share one backdrop.

3. **Observability-card tile** (`components/tile/ServiceTile.tsx`): status-tinted top
   hairline, a large faint **per-service icon watermark** filling the upper field, a
   **full-bleed gradient area chart** bleeding to the bottom edges, and content
   anchored low. Boolean heroes render as a state chip (`✓ Reachable`) instead of a
   bare `true`. Per-service glyphs + the bool-hero helper live in
   `lib/serviceVisuals.ts` (shared by the tile and the detail-sheet hero).

4. **Sparkline rewrite** (`components/primitives/Sparkline.tsx`): smooth midpoint
   curves, vertical headroom so constant series rest as a calm low line (no more
   rectangles), and a `stretch` mode for full-bleed footers. The unused `baseline`
   prop was removed.

5. **App-wide application**: the material is applied across the whole app, not just the
   dashboard — `SettingsLayout` (shared header rhythm + transparent container), the
   settings pages' list/section cards (`glass-regular`), `Popover` (`glass-thick`
   dropdowns, incl. the profile switcher), `Tabs` (`glass-thin` bar), the active nav
   item (gold `accent-soft` identity), and a rebuilt on-brand 404. The bespoke setup
   wizard keeps its own designed shell.

6. **Accessibility**: full fallbacks for `prefers-reduced-transparency` (near-opaque,
   no blur, no wash), `prefers-contrast`, `prefers-reduced-motion`, and
   `@supports not (backdrop-filter)`.

## Consequences

### Positive

- Tiles read as intentional, dense data cards; the dead middle space is gone.
- One coherent material system across tiles, nav, dialogs, sheet, and charts.
- Boolean/degenerate hero values no longer look broken.
- Identity preserved: no palette/font/grid change; reversible (CSS + presentational).

### Negative

- More CSS surface area (`glass.css`) and a per-service icon map to maintain when
  new services are added (`lib/serviceVisuals.ts`).
- `backdrop-filter` has a GPU cost; mitigated by the static (non-animated) backdrop
  and the reduced-transparency fallback.

### Risks

- Nested glass (a `glass-regular` hero inside the `glass-thick` sheet) can look muddy
  on low-end GPUs; acceptable because the inner panel carries its own opaque-ish
  gradient.
- Tile-internal layout (absolute chart footer + watermark) is more intricate than the
  old flow layout; covered by existing `ServiceTile` / smoke tests.

## Alternatives Considered

| Alternative                                         | Why Rejected                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Animated aurora backdrop (full Vision parity)       | Bigger vibe shift + GPU cost; maintainer chose the static gold wash.                |
| Import the reference project's palette/fonts        | Would erase Watchman's cold-gold dev-console identity.                              |
| Keep flat `surface-1` tiles, only restyle sparkline | Did not address the core emptiness/hierarchy problem.                               |
| Reorder renderer `summary` to avoid boolean heroes  | 14+ renderers, brittle per-service tuning; handled generically in the tile instead. |

## References

- [[docs/adr/021-frontend-dashboard-upgrade|ADR-021: Frontend dashboard upgrade]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014: Bento design system]]
- [[docs/components/bento-dashboard|Bento dashboard component]]
- Related code: `apps/frontend/src/styles/glass.css`, `apps/frontend/src/styles/tokens.css`,
  `apps/frontend/src/components/tile/ServiceTile.tsx`,
  `apps/frontend/src/components/primitives/Sparkline.tsx`,
  `apps/frontend/src/lib/serviceVisuals.ts`
