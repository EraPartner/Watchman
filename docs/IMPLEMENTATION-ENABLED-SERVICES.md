# Implementation Summary: Enabled Services Configuration

## What Was Implemented

A complete feature to selectively enable/disable services in the Watchman Dashboard through the `ENABLED_SERVICES`
environment variable.

## Files Changed

### Backend

1. **`apps/backend/config.js`**
    - Added `parseEnabledServices()` function to parse the `ENABLED_SERVICES` environment variable
    - Added `enabledServices` configuration field containing a Set of enabled service names
    - If `ENABLED_SERVICES` is empty, all services are enabled by default

2. **`apps/backend/services/ServiceManager.js`**
    - Imported `getConfig` to access enabled services configuration
    - Updated `initializeServices()` to check enabled status before initializing each service
    - Only services in `config.enabledServices` are instantiated
    - Disabled services consume no resources or network requests

3. **`apps/backend/server.js`**
    - Updated `/api/config/frontend` endpoint to include `enabledServices` array in response
    - Frontend receives the list of enabled services from this endpoint

### Frontend

1. **`apps/frontend/src/hooks/useEnabledServices.ts`** (NEW)
    - Custom React hook that fetches enabled services from the backend
    - Provides `isServiceEnabled()` helper function
    - Caches configuration with infinite stale time (rarely changes)

2. **`apps/frontend/src/services/ApiClient.ts`**
    - Updated `FrontendConfig` interface to include `enabledServices: string[]`

3. **`apps/frontend/src/components/LiveServerDashboard.tsx`**
    - Imports and uses `useEnabledServices` hook
    - All service queries include `enabled: isServiceEnabled("serviceName")` option
    - Disabled queries won't fetch data from the backend
    - Conditional rendering of service cards based on enabled status
    - Smart stacking of cards (e.g., IPFS/Homebridge only stack if both enabled)

### Documentation

1. **`apps/backend/.env.example`** (NEW)
    - Complete example `.env.local` file with all service options
    - Includes `ENABLED_SERVICES` configuration example

2. **`docs/ENABLED-SERVICES.md`** (NEW)
    - Complete user guide for the feature
    - Lists all available services
    - Provides usage examples
    - Explains how it works internally
    - Includes troubleshooting tips

## How It Works

### Backend Flow

```
1. Environment: ENABLED_SERVICES=adguard,tor,bitcoin
                    ↓
2. Config: parseEnabledServices() → Set{"adguard", "tor", "bitcoin"}
                    ↓
3. ServiceManager: Only initialize services in the Set
                    ↓
4. API Endpoint: /api/config/frontend returns enabledServices array
```

### Frontend Flow

```
1. useEnabledServices hook: Fetches enabledServices from /api/config/frontend
                    ↓
2. LiveServerDashboard: Gets isServiceEnabled() function
                    ↓
3. Query Setup: useQuery(..., { enabled: isServiceEnabled("service") })
                    ↓
4. Rendering: Conditionally render service cards
```

## Key Features

✅ **No Network Traffic**: Disabled services don't send API requests  
✅ **No Backend Processing**: Disabled services aren't initialized  
✅ **Clean UI**: Only cards for enabled services are shown  
✅ **Flexible**: Change settings in `.env.local` and restart  
✅ **Default Behavior**: Leave empty to enable all services  
✅ **Smart Card Layout**: Cards intelligently stack/unstack based on enabled count

## Configuration Example

### Minimal setup (3 services):

```env
ENABLED_SERVICES=adguard,synology,bitcoin
```

Result: Only AdGuard, Synology, and Bitcoin cards appear on the dashboard

### All services enabled (default):

```env
ENABLED_SERVICES=
```

Result: All available service cards appear (same as before this feature)

### Custom selection:

```env
ENABLED_SERVICES=adguard,tor,qbittorrent,roon,synology
```

Result: Only DNS, Tor relay, torrent, audio, and NAS cards appear

## Testing

To test the feature:

1. Add to `.env.local`:
   ```
   ENABLED_SERVICES=adguard,tor
   ```

2. Restart backend server

3. Check that:
    - Only AdGuard and Tor cards appear on dashboard
    - Overview stats show only 2 services
    - No network requests for other services (check Network tab in DevTools)

4. Change `ENABLED_SERVICES` to different values and verify cards update

## Backward Compatibility

✅ Fully backward compatible - existing deployments work without changes  
✅ If `ENABLED_SERVICES` is not set, all services are enabled (old behavior)  
✅ No breaking changes to API or component interfaces

## Future Enhancements

Potential improvements (not implemented):

- Web UI toggle to enable/disable services without restarting
- Persistent enable/disable settings in database
- Per-user service preferences
- Service dependency management
