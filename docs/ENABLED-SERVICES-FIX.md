# Enabled Services Fix

## Issue

The `ENABLED_SERVICES` configuration in `.env.local` was not working correctly. Non-enabled services were:

- Still making network requests
- Displaying cards in the UI
- Consuming cache resources
- Creating unnecessary traffic

## Root Cause

While the backend `ServiceManager` correctly respected the `ENABLED_SERVICES` setting and only initialized enabled
services, the frontend had two problems:

1. **LiveServerDashboard.tsx** was conditionally querying some services (with `enabled: isServiceEnabled()`) but then *
   *unconditionally rendering ALL service cards**
2. Individual service cards (like `BitcoinCard`, `HomebridgeCard`, etc.) were making their own API calls using
   `useEffect` hooks

This meant that even with `ENABLED_SERVICES=bitcoin,tor`, all 15+ service cards were still being rendered and making API
calls.

## Solution

Modified `LiveServerDashboard.tsx` to conditionally render service cards based on `isServiceEnabled()`:

### Changes Made

1. **Conditional Card Rendering**: Wrapped all service card rendering in `if (isServiceEnabled("servicename"))` checks
2. **Smart Stacking**: For stacked cards (IPFS/Homebridge, Nostr/AlbyHub, Roon/Philips), added logic to:
    - Show both cards stacked if both services are enabled
    - Show single card if only one service is enabled
    - Show nothing if neither service is enabled
3. **Loading Check**: Updated the initial loading check to only wait for enabled services
4. **Refresh Handler**: Updated the refresh function to only refetch enabled services

### Files Modified

- `/apps/frontend/src/components/LiveServerDashboard.tsx`

### Example

With `ENABLED_SERVICES=bitcoin,tor` in `.env.local`:

- ✅ Only Bitcoin and Tor cards are rendered
- ✅ Only Bitcoin and Tor API endpoints are called
- ✅ No network traffic to disabled services
- ✅ No cache pollution from disabled services

## Testing

To verify the fix works:

1. Set `ENABLED_SERVICES=bitcoin,tor` in `apps/backend/.env.local`
2. Start the application: `npm run dev`
3. Open browser DevTools Network tab
4. Verify only Bitcoin and Tor endpoints are being called
5. Verify only Bitcoin and Tor cards are displayed

## Configuration

The `ENABLED_SERVICES` environment variable accepts a comma-separated list of service names:

```bash
ENABLED_SERVICES=bitcoin,tor,synology,roon
```

Available service names:

- `bitcoin` - Bitcoin Core node
- `tor` - Tor relay
- `adguard` - AdGuard Home
- `qbittorrent` - qBittorrent client
- `synology` - Synology NAS
- `ipfs` - IPFS node
- `roon` - Roon ROCK server
- `philips` - Philips Hue Bridge
- `homebridge` - Homebridge
- `macmini` - Mac Mini SSH monitoring
- `albyhub` - Alby Hub
- `beryl` - Beryl AX router
- `telenet` - Telenet router
- `raspi` - Raspberry Pi
- `nostrcheck` - Nostr relay

If `ENABLED_SERVICES` is not set or empty, all services are enabled by default.

## Benefits

- 🚀 Reduced network traffic
- 💾 Lower memory usage
- ⚡ Faster page load
- 🎯 Cleaner UI with only relevant services
- 🔒 Better security (fewer attack surfaces)
