# Enabled Services Configuration

> **Note**: If you're experiencing issues with disabled services still making requests or showing cards,
> see [ENABLED-SERVICES-FIX.md](./ENABLED-SERVICES-FIX.md) for details on the recent fix (January 2026).

## Overview

The Watchman Dashboard now supports selectively enabling or disabling services through the `ENABLED_SERVICES`
environment variable. This allows you to:

- **Hide cards** for services you don't want to monitor
- **Reduce backend traffic** by not querying disabled services
- **Simplify your dashboard** to focus on the services you care about

## Configuration

Add the `ENABLED_SERVICES` variable to your `.env.local` file:

```env
# Leave empty to enable all services by default
ENABLED_SERVICES=

# Or specify a comma-separated list of services to enable
ENABLED_SERVICES=adguard,tor,bitcoin,synology
```

## Available Services

The following service identifiers can be used in the `ENABLED_SERVICES` list:

### Software Services

- `adguard` - AdGuard Home DNS/Ad blocker
- `tor` - Tor relay node
- `bitcoin` - Bitcoin Core
- `qbittorrent` - qBittorrent torrent client
- `ipfs` - IPFS node
- `homebridge` - HomeKit bridge
- `nostrcheck` - Nostr relay
- `albyhub` - Alby Hub Lightning wallet

### Hardware Services

- `synology` - Synology NAS
- `roon` - Roon audio server
- `philips` - Philips Hue Bridge
- `macmini` - Mac Mini
- `raspi` - Raspberry Pi
- `beryl` - Beryl AX router
- `telenet` - Telenet router

## Examples

### Minimal Setup

Only monitor the essentials:

```env
ENABLED_SERVICES=adguard,synology,macmini
```

### DNS & Torrent Focus

```env
ENABLED_SERVICES=adguard,qbittorrent,tor
```

### All Services Enabled (Default)

Leave the value empty:

```env
ENABLED_SERVICES=
```

Or list all services:

```env
ENABLED_SERVICES=bitcoin,adguard,tor,qbittorrent,synology,ipfs,roon,philips,homebridge,macmini,albyhub,beryl,telenet,raspi,nostrcheck
```

## How It Works

### Backend

1. On startup, the backend reads `ENABLED_SERVICES` from `.env.local`
2. Only enabled services are initialized by `ServiceManager`
3. Health check endpoints only return data for enabled services
4. Disabled services don't consume any resources or network requests

### Frontend

1. The frontend fetches the list of enabled services from `/api/config/frontend`
2. Service cards are conditionally rendered based on this list
3. Disabled service queries are skipped (via React Query's `enabled` option)
4. No API calls are made to backend endpoints for disabled services

## Benefits

✅ **Performance**: Disabled services don't consume CPU or memory  
✅ **Reduced Traffic**: No unnecessary API calls to disabled service endpoints  
✅ **Cleaner UI**: Only show cards for services you actually use  
✅ **Easier Debugging**: Focus monitoring on your actual setup  
✅ **Flexible**: Change enabled services at any time by updating `.env.local`

## Changing Settings

To enable/disable services:

1. Edit `.env.local` and update the `ENABLED_SERVICES` variable
2. Restart the backend server
3. The frontend will automatically update when it fetches the new configuration

## Troubleshooting

**I made changes to `ENABLED_SERVICES` but the cards are still showing**

- Make sure you restarted the backend server
- Wait a few seconds for the frontend to refetch the configuration
- Check browser console for any errors

**A service I disabled is still making requests**

- Clear your browser's React Query cache by opening DevTools and refreshing
- Check that your service identifier matches exactly (lowercase, no spaces)

**No cards are showing at all**

- Verify your `.env.local` syntax is correct (comma-separated, no extra spaces)
- Make sure at least one service is enabled
- Check the server logs for parsing errors
