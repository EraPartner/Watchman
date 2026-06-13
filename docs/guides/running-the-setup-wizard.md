---
title: Running the Setup Wizard
type: guide
status: superseded
date: 2026-06-13
tags:
  [
    guide,
    setup,
    wizard,
    onboarding,
    first-boot,
    configuration,
    services,
    v2,
    single-user,
    archived,
    superseded-by-adr-019,
  ]
description: Step-by-step guide to using the Watchman setup wizard — SUPERSEDED by ADR-019 (Connect step removed, archived for historical reference)
aliases: [setup guide, wizard guide, onboarding, first-time setup]
---

# Running the Setup Wizard (ARCHIVED)

> [!warning] SUPERSEDED — Archived for Historical Reference
> This guide describes the setup wizard as it existed when the split-deploy architecture was active, including the "Connect" step used to pair with a remote Pi backend. This step was removed as part of [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]]. The wizard now begins at the "Welcome" step and provides a simpler flow. The document below is preserved for historical context.
>
> The setup wizard still exists but with fewer steps (no Connect step).

## When Does the Wizard Appear?

The wizard appears automatically on first boot when:

- The database has no configured services
- You haven't dismissed the wizard by clicking "Skip for Now"

You can re-enter the wizard anytime by going to **Settings → Services** and using the "Configure" option (if you've dismissed it).

## Step 1: Welcome

**What to expect:**

- Brief introduction to Watchman
- Two buttons: **Get Started** or **Skip for Now**

**What to do:**

- Click **Get Started** to proceed to service selection
- Click **Skip for Now** if you want to set up services later (you can always return)

## Step 2: Choose Services (Kind Picker)

**What to expect:**

- A searchable grid of 13 available services
- Services grouped into 5 categories:
  - **Network** — Router, Tor
  - **Media** — qBittorrent, IPFS, Roon
  - **Bitcoin** — Bitcoin
  - **Home Automation** — Homebridge, Philips Hue, Alby Hub
  - **Hardware** — Synology, Raspberry Pi, Mac Mini, AdGuard Home

**What to do:**

1. (Optional) Use the search box to filter by service name
2. Click a service card to select it
3. Configure that service in the next step

**Can I add multiple services?**
Yes! After configuring one service, the wizard returns to this step so you can add another. Repeat until you've added all the services you want to monitor.

## Step 3: Configure

**What to expect:**

- A dynamic form tailored to your chosen service
- Fields vary by service (e.g., Bitcoin has different fields than qBittorrent)
- Required fields marked with `*`
- Some fields may be password/secret fields (shown with a different input style)

**What to do:**

1. Fill in each field according to your service's settings
   - For **Bitcoin** — Onion address, RPC user/password, RPC port
   - For **qBittorrent** — API URL, username, password
   - For **Synology** — IP address, username, password
   - (Each service has its own schema; the form adapts)

2. (Optional) Click **Test Connection** to verify credentials before saving
   - This confirms Watchman can reach your service

3. Click **Save** to store the service configuration
   - Secrets are encrypted and stored securely
   - The wizard moves to the Review step

**Troubleshooting:**

- **Test Connection fails?** Double-check your credentials and that the service is reachable
- **Form validation errors?** Make sure all required fields (`*`) are filled

## Step 4: Review

**What to expect:**

- A summary of all services you've added in this session
- Two buttons: **Add Another Service** or **Finish Setup**

**What to do:**

- Click **Add Another Service** to go back to the Kind Picker (Step 2) and add more services
- Click **Finish Setup** when you're done
  - The wizard closes
  - You're taken to the main dashboard
  - Watchman begins polling your configured services

## After Setup

### Dashboard

Once setup is complete:

- The dashboard shows live status for each service
- Green dot = healthy, red dot = problem
- Click a service card to see detailed metrics

### Adding More Services Later

To add more services after the initial setup:

1. Go to **Settings** (usually in the sidebar or hamburger menu)
2. Select **Services**
3. Click **+ Add Service**
4. The form appears (same as Step 3 of the wizard)
5. Fill in the details and save

### Editing or Removing Services

- **Edit** — Click the edit icon next to a service in Settings → Services
- **Delete** — Click the delete icon next to a service
- Changes take effect immediately (no restart needed)

## Dismissing and Re-entering the Wizard

### Skip the Wizard

If you click **Skip for Now**:

- The wizard is dismissed
- You're taken to the dashboard (which will be empty)
- The dismissal is stored in your browser's local storage

### Re-enter the Wizard

To come back to the wizard later:

1. Click the hamburger menu or go to **Settings**
2. Look for an option to reset or re-run setup
3. Or clear your browser's local storage and refresh

> [!note]
> The dismissal flag is stored locally in your browser. Clearing browser storage, using a different device, or opening a private/incognito window will show the wizard again.

## Best Practices

1. **Start with services you use most** — Bitcoin, qBittorrent, Synology
2. **Test connection before saving** — Catch misconfigurations early
3. **Add one service at a time** — Easier to troubleshoot if something fails
4. **Keep credentials handy** — Have usernames, passwords, and API URLs ready
5. **Don't worry about perfection** — You can edit settings anytime

## Troubleshooting

### I accidentally skipped the wizard. How do I run it again?

Clear your browser's local storage:

1. Open browser DevTools (F12 or Cmd+Opt+I)
2. Go to **Application** or **Storage**
3. Find **Local Storage**
4. Look for `watchman.setupDismissed` and delete it
5. Refresh the page

Or, try opening an incognito/private window and visiting Watchman again.

### The wizard closed but the dashboard is still empty

This might happen if:

- You skipped the wizard without adding services
- All services failed to save (check form validation)
- The backend isn't running

Try:

1. Go to **Settings → Services**
2. Click **+ Add Service** to add one manually
3. Check browser console (F12) for error messages

### Test Connection fails even though the service is reachable

Possible reasons:

- Credentials are incorrect (double-check username/password)
- Service URL is wrong (verify IP address or domain)
- Firewall is blocking the connection
- Service is offline or not responding

### I want to reconfigure all services

You can:

1. Go to **Settings → Services**
2. Delete all existing services
3. Go back to the Setup Wizard (or add services manually one-by-one)

## Related

- [[docs/features/ui-configuration|UI Configuration Feature]] — How configuration works under the hood
- [[docs/components/setup-wizard|Setup Wizard Components]] — Technical documentation for developers
- [[docs/guides/adding-services|Adding Services Guide]] — How to add custom service integrations
- [[docs/integrations/index|Service Integrations]] — List of all supported services
