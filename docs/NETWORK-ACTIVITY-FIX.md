# Network Activity Fix for Disabled Services

## Problem Identified

The enabled services functionality had a critical gap: while the backend correctly protected routes with
`requireServiceEnabled()` middleware, and the LiveServerDashboard conditionally rendered cards, **individual card
components were making their own independent network requests without checking if the service was enabled**.

Additionally, the **`/api/services/health` endpoint was defined in the OpenAPI spec but not implemented in the backend
**, causing the frontend to make requests that returned 404 repeatedly.

## Root Causes

### 1. Missing Backend Endpoint

- Frontend was calling `/api/services/health` to get overall health summary
- This endpoint was documented but not implemented in `server.js`
- Frontend retried the failing 404 requests continuously

### 2. Card Components Making Ungated Requests

Card components made their own queries without checking if they were enabled:

- `BitcoinCard` - Direct API calls in useEffect
- `SynologyCard` - useQuery without enabled flag
- `RoonCard` - useQuery without enabled flag
- `QBittorrentCard` - useEffect making direct API calls
- `IpfsCard` - useEffect making direct API calls
- `AlbyHubCard` - useEffect making direct API calls
- `MacMiniCard` - useQuery without enabled flag
- `RaspberryPiCard` - useQuery without enabled flag
- `PhilipsBridgeCard` - useQuery without enabled flag
- `HomebridgeCard` - Multiple useQueries without enabled flag
- `RouterCard` - useQuery without proper enabled gate

## Solutions Implemented

### 1. Added Missing `/api/services/health` Endpoint

**File**: `apps/backend/server.js`

```javascript
app.get(
  "/api/services/health",
  healthLimiter,
  async (req, res) => {
    try {
      const config = getConfig();
      const enabledServices = config.enabledServices;

      // Only check health for enabled services
      const healthResults = {};

      for (const serviceName of enabledServices) {
        try {
          healthResults[serviceName] = await serviceManager.getServiceHealth(
            serviceName
          );
        } catch (error) {
          healthResults[serviceName] = {
            status: "offline",
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      }

      res.json({
        services: healthResults,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Services health check failed:", error.message);
      res.status(500).json({
        error: "Failed to check services health",
        message: error.message,
      });
    }
  },
);
```

**Key Features:**

- Only iterates through enabled services from config
- Never makes requests for disabled services
- Returns 200 status with only enabled services
- Provides consistent health data for the dashboard overview

### 2. Added Enabled Service Checks to All Card Components

Every card component now:

1. Imports `useEnabledServices` hook
2. Calls `isServiceEnabled(serviceName)` at component start
3. Adds `enabled: isEnabled` flag to all useQuery calls
4. Adds `if (!isEnabled) return;` guard to useEffect hooks

**Example Pattern:**

```typescript
const CardComponent: React.FC = () => {
  const { isServiceEnabled } = useEnabledServices();
  const isEnabled = isServiceEnabled("servicename");

  // useQuery pattern
  const query = useQuery({
    queryKey: ["service", "data"],
    queryFn: () => apiClient.getData(),
    enabled: isEnabled,  // ← Gate the query
  });

  // useEffect pattern
  useEffect(() => {
    if (!isEnabled) return;  // ← Early return

    // ... fetch logic
  }, [isEnabled]);
};
```

### 3. Updated LiveServerDashboard

**File**: `apps/frontend/src/components/LiveServerDashboard.tsx`

Updated the `servicesHealthQuery` documentation to clarify that the backend endpoint only returns enabled services,
making it safe to always call.

## Modified Files

### Backend

- `apps/backend/server.js` - Added `/api/services/health` endpoint

### Frontend Components

- `apps/frontend/src/components/BitcoinCard.tsx`
- `apps/frontend/src/components/SynologyCard.tsx`
- `apps/frontend/src/components/RoonCard.tsx`
- `apps/frontend/src/components/QBittorrentCard.tsx`
- `apps/frontend/src/components/IpfsCard.tsx`
- `apps/frontend/src/components/AlbyHubCard.tsx`
- `apps/frontend/src/components/MacMiniCard.tsx`
- `apps/frontend/src/components/RaspberryPiCard.tsx`
- `apps/frontend/src/components/PhilipsBridgeCard.tsx`
- `apps/frontend/src/components/HomebridgeCard.tsx`
- `apps/frontend/src/components/RouterCard.tsx`
- `apps/frontend/src/components/LiveServerDashboard.tsx`

## Expected Results After Fix

### Before Fix

```
ENABLED_SERVICES=adguard,bitcoin,tor
Network tab shows:
❌ GET /api/adguard/status - 200
❌ GET /api/bitcoin/status - 200
❌ GET /api/tor/relay - 200
❌ GET /api/qbittorrent/status - 404 (repeated many times)
❌ GET /api/ipfs/status - 404 (repeated many times)
❌ GET /api/synology/status - 404 (repeated many times)
❌ GET /api/roon/status - 404 (repeated many times)
❌ GET /api/services/health - 404 (repeated many times)
❌ GET /api/philips/status - 404
❌ GET /api/homebridge/status - 404
```

### After Fix

```
ENABLED_SERVICES=adguard,bitcoin,tor
Network tab shows:
✅ GET /api/adguard/status - 200
✅ GET /api/bitcoin/status - 200
✅ GET /api/tor/relay - 200
✅ GET /api/services/health - 200
✅ GET /api/config/frontend - 200
[No requests for: qbittorrent, ipfs, synology, roon, philips, homebridge, etc.]
```

## How It Works Now

1. **Frontend loads** → Fetches `/api/config/frontend` to get enabled services list
2. **Dashboard initializes** → `useEnabledServices()` hook loads enabled services
3. **Card rendering** → Parent checks `isServiceEnabled()` before rendering card
4. **Card queries** → Each card now also has `enabled: isServiceEnabled(serviceName)` flag
5. **React Query** → Respects the `enabled` flag and doesn't execute disabled queries
6. **Network result** → Zero network requests for disabled services

## Double Protection Pattern

The system now has **two layers of protection**:

1. **Component Rendering Gate** (Parent level)
   ```typescript
   if (isServiceEnabled("bitcoin")) {
     hardwareTiles.push(<BitcoinCard key="bitcoin" />);
   }
   ```
    - Prevents card component from being instantiated
    - Most efficient approach

2. **Query Gate** (Card level)
   ```typescript
   const query = useQuery({
     ...options,
     enabled: isEnabled,
   });
   ```
    - Prevents queries from executing even if component is instantiated
    - Additional safety layer
    - Useful for cards that might be rendered conditionally elsewhere

## Performance Impact

- **Reduced network traffic**: No requests to disabled services
- **Reduced cache operations**: Disabled services don't pollute cache
- **Faster page load**: Fewer concurrent requests
- **Lower bandwidth**: No failed 404 requests retrying

## Testing the Fix

```bash
# Set limited services
export ENABLED_SERVICES="adguard,bitcoin,tor"
npm run backend
npm run frontend

# Verify in browser DevTools > Network tab
# Should only see requests for adguard, bitcoin, tor, config, and services/health
# Should NOT see requests for disabled services
```

## Verification Checklist

- [ ] Backend server starts without errors
- [ ] Frontend builds without compilation errors
- [ ] Browser DevTools Network tab shows no requests for disabled services
- [ ] Cards for disabled services don't appear in dashboard
- [ ] Cache is not polluted with disabled service data
- [ ] Services Overview shows correct count (only enabled services)
- [ ] Manual refresh only refreshes enabled services
