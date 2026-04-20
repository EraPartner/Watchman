---
title: Setup Wizard Components
type: component
status: active
date: 2026-04-20
tags: [component, frontend, setup, wizard, onboarding, multi-step, form, service-configuration, v2, single-user]
description: Multi-step setup wizard for first-boot service configuration with welcome, kind picker, configure, and review steps
aliases: [setup wizard, onboarding wizard, setup flow]
---

# Setup Wizard Components

> [!abstract] Overview
> The Setup Wizard is a **multi-step flow** that guides first-time users through initial service configuration. It replaces the single-page wizard with a structured four-step experience: welcome → kind picker → configure → review. Users can skip the wizard and return later via Settings, and the dismissal state is persisted to localStorage.

## Components

### SetupWizard (Shell)

**File**: `[[apps/frontend/src/pages/setup/SetupWizard.tsx]]`

Main orchestrator component. Owns:
- **step state** — "connect" | "welcome" | "pick" | "configure" | "review"
- **selectedKind state** — Currently selected service kind
- **addedIds state** — Array of IDs for services added in this session

Renders the shell layout (grain background, sidebar with brand + progress rail, main content area) and dispatches to step-specific components based on state.

**Key Behavior:**
- **Initial step gating** — When `getDesktopBridge()?.apiUrl` is empty, wizard starts at "connect"; when already set, starts at "welcome"
- On `skip`: Calls `dismiss()` to set localStorage flag, then navigates to "/"
- On `finish`: Navigates to "/" without dismiss (can re-enter wizard)
- On `pick`: Sets selectedKind and moves to "configure" step
- On `configured`: Adds ID to addedIds, clears selectedKind, moves to "review" step
- Back button logic: From "pick" → "review" (if services added) or "welcome", from "configure" → "pick"

### ProgressRail

**File**: `[[apps/frontend/src/pages/setup/ProgressRail.tsx]]`

Visual progress indicator. Shows five steps with titles and a connecting line:
- Connect (split-deploy only; skipped if `apiUrl` already set)
- Welcome
- Choose Services
- Configure
- Review

Type: `type SetupStep = "connect" | "welcome" | "pick" | "configure" | "review"`

Highlights the current step and provides visual feedback.

### ConnectStep

**File**: `[[apps/frontend/src/pages/setup/steps/ConnectStep.tsx]]`

**Split-deploy only.** First step when running on Electron without an `apiUrl` configured. Guides the user to pair the Mac client with a Raspberry Pi backend (or any Fastify backend on the LAN).

Displays:
- Explanation of split-deploy architecture (backend on always-on Pi, client on Mac)
- Zod-validated URL input with placeholder `http://192.168.1.10:3001`
- Help text: "HTTP only on LAN. Reserve a DHCP lease so the URL stays stable."
- Test & Save button with 3s timeout probe of `GET {url}/meta/health`

**Behavior:**
- On successful probe (200 OK), calls `bridge.saveApiUrl(url)` and `bridge.reload()`, then navigates to Welcome
- On probe failure (timeout, network error, or non-200), shows error message with context (e.g., "No response in 3s. Is the backend running at...?")
- If `bridge.saveApiUrl` or `bridge.reload` are missing, shows error and suggests restarting the app
- Dismissible errors; user can edit the URL and retry

**Props:**
- `onConnected: () => void` — Navigate to Welcome step on successful connection

### WelcomeStep

**File**: `[[apps/frontend/src/pages/setup/steps/WelcomeStep.tsx]]`

Second step (or first in web/non-split-deploy mode). Introduction and decision point. Displays:
- Watchman branding and tagline
- Brief explanation of what the wizard does
- Two CTAs: "Get Started" or "Skip for Now"

**Props:**
- `onStart: () => void` — Navigate to kind picker
- `onSkip: () => void` — Dismiss wizard and go to dashboard

### KindPickerStep

**File**: `[[apps/frontend/src/pages/setup/steps/KindPickerStep.tsx]]`

Service type selection. Features:
- **Search box** — Filter by service name or kind
- **5 category tabs** — Network, Media, Bitcoin, Home Automation, Hardware
- **KindCard components** — Per-service cards with icons, names, and descriptions
- **13 service kinds** — AdGuard, Bitcoin, Tor, qBittorrent, IPFS, Synology, Roon, Philips Hue, Homebridge, Alby Hub, Raspberry Pi, Mac Mini, Router

**Props:**
- `onSelect: (kind: string) => void` — Select a service kind
- `onBack: () => void` — Navigate back (to review if services added, otherwise welcome)

**Logic:**
- Uses `kindCategories` lookup table for grouping and metadata
- Renders lucide icons for each service
- Filters displayed cards based on search input

### KindCard

**File**: `[[apps/frontend/src/pages/setup/KindCard.tsx]]`

Individual service card. Shows:
- Service icon (lucide)
- Service name
- Brief description

Responds to click with `onSelect` callback.

### ConfigureStep

**File**: `[[apps/frontend/src/pages/setup/steps/ConfigureStep.tsx]]`

Service configuration form. Embeds `ServiceEditor` component with:
- Dynamic form fields generated from `/config/kinds` schemas
- Client-side validation using Zod
- Test connection button
- Save and discard actions

**Props:**
- `kind: string` — Service kind to configure
- `onDone: (id: string) => void` — Callback after successful save
- `onBack: () => void` — Navigate back to kind picker

**Key Behavior:**
- Calls `ServiceEditor` with `hideKind={true}` and `hideCancel={true}` (hiding the kind selector and cancel button since those are managed by the wizard step itself)
- On successful save, calls `onDone` with the new instance ID
- Moves to review step on completion

### ReviewStep

**File**: `[[apps/frontend/src/pages/setup/steps/ReviewStep.tsx]]`

Summary of added services. Displays:
- List of services added in this session with names and kinds
- "Add Another Service" button (loops back to kind picker)
- "Finish Setup" button (closes wizard, navigates to dashboard)

**Props:**
- `addedIds: string[]` — IDs of services added
- `onAddAnother: () => void` — Navigate to kind picker
- `onFinish: () => void` — Close wizard and navigate to dashboard

## Styling

**File**: `[[apps/frontend/src/pages/setup/setup.css]]`

Custom CSS for the setup shell and wizard-specific layout:
- `.setup-shell` — Main container with sidebar layout
- `.setup-shell__grain` — Decorative grain background
- `.setup-shell__rail` — Left sidebar (brand + progress rail)
- `.setup-shell__main` — Main content area
- `.setup-stage` — Individual step container with fade-in animation
- `.setup-brand` — Logo and title in sidebar
- Responsive grid for KindCard layout (grid-cols-2 lg:grid-cols-3)

## Kind Categories

**File**: `[[apps/frontend/src/pages/setup/kindCategories.ts]]`

Lookup table defining:
- 5 categories (Network, Media, Bitcoin, Home Automation, Hardware)
- Per-service metadata:
  - `name` — Display name
  - `description` — One-line explanation
  - `icon` — lucide icon component name (as string)
  - `category` — Which tab to display in

Example:
```typescript
{
  bitcoin: {
    name: "Bitcoin",
    description: "Bitcoin full node",
    icon: "Bitcoin",
    category: "Bitcoin"
  },
  qbittorrent: {
    name: "qBittorrent",
    description: "Torrent client",
    icon: "Download",
    category: "Media"
  }
}
```

## Integration with ServiceEditor

The wizard's `ConfigureStep` embeds `[[docs/components/service-editor|ServiceEditor]]` with optional props to hide the kind selector and cancel button:
- `hideKind={true}` — Kind is already selected in prior step
- `hideCancel={true}` — Back button managed by wizard logic

ServiceEditor filters framework fields (instanceId, enabled, cacheTtlMs, timeoutMs, pollPolicy) into an "Advanced" collapsible, renders kind-specific config fields, and supports array types (stringArray, numberArray) with CSV input. See [[docs/components/service-editor|ServiceEditor documentation]] for field handling, defaults, and array parsing.

This keeps the form reusable for both first-boot setup and runtime service editing.

## Split-Deploy Integration

When running the Electron desktop app in split-deploy mode (backend on Pi, client on Mac):

- ConnectStep appears first and gates the rest of the wizard until a backend URL is entered and tested
- `getDesktopBridge()?.apiUrl` is checked on SetupWizard mount; if empty, `initialStep()` returns "connect"
- Once `apiUrl` is saved and the app reloads, subsequent visits to the wizard start at "welcome"
- Desktop bridge methods (`saveApiUrl`, `reload`) are called from ConnectStep to persist the URL and trigger a reload
- See [[docs/adr/018-split-deploy-pi-backend|ADR-018]] for architecture rationale

## Related

- [[docs/adr/018-split-deploy-pi-backend|ADR-018]] — Split Deploy: Pi Backend + Mac Client
- [[docs/features/ui-configuration|UI Configuration Feature]] — Overview of setup flow and service management
- [[docs/components/service-editor|ServiceEditor Component]] — Embedded configuration form
- [[docs/components/use-setup-dismissal|useSetupDismissal Hook]] — Persistence of wizard dismissal state
- [[docs/components/offline-banner|OfflineBanner Component]] — Offline notification and recovery
- [[docs/components/index|Components Index]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
