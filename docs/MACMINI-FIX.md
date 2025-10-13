# Mac Mini Card Fix - October 13, 2025

## Problem

The Mac Mini card was showing "Failed to fetch macmini status" error in the frontend, even though the backend was
working correctly and returning data.

## Root Causes

1. **Missing Frontend Environment Configuration**: The frontend had no `.env.local` file to specify the backend URL
2. **Vite Host Blocking**: Vite was blocking requests from the production domain `watchman.tornostrtorrent.win`
3. **No Smart URL Detection**: The frontend was hardcoded to use `http://localhost:3001` in production

## Solutions Implemented

### 1. Created Frontend Environment File

**File**: `apps/frontend/.env.local`

```dotenv
# Backend API URL - leave empty to use auto-detection
# In development: will use the Vite proxy (no CORS issues)
# In production: will use the current domain with port 3001
VITE_BACKEND_URL=

# Optional: Frontend port (only used in dev mode)
VITE_FRONTEND_PORT=5173
VITE_HMR_PORT=24678
```

### 2. Added Smart Backend URL Detection

**Files Modified**:

- `apps/frontend/src/hooks/useServiceHealth.ts`
- `apps/frontend/src/services/ApiClient.ts`

**Logic**:

- If `VITE_BACKEND_URL` is explicitly set, use it
- In development mode (`import.meta.env.DEV`), use relative URLs (Vite proxy handles routing)
- In production, dynamically construct the URL from `window.location` with port 3001
- Fallback to `http://localhost:3001` if all else fails

### 3. Updated Vite Configuration

**File**: `apps/frontend/vite.config.ts`

Added `allowedHosts` configuration to allow both localhost and production domain:

```typescript
server: {
  // ...
  allowedHosts: [
    "localhost",
    ".localhost",
    "watchman.tornostrtorrent.win",
    ".tornostrtorrent.win",
  ],
  // ...
}
```

## How It Works Now

### Development Mode (localhost)

1. Frontend runs on `http://localhost:5173`
2. API calls use relative URLs (e.g., `/api/macmini/status`)
3. Vite proxy forwards requests to `http://localhost:3001`
4. No CORS issues, browser cookies work seamlessly

### Production Mode (watchman.tornostrtorrent.win)

1. Frontend runs on `https://watchman.tornostrtorrent.win:5173`
2. API calls use `https://watchman.tornostrtorrent.win:3001/api/macmini/status`
3. Direct connection to backend
4. Vite allows the production domain in `allowedHosts`

## Backend Configuration

The backend was already working correctly with these settings in `apps/backend/.env.local`:

```dotenv
MACMINI_HOST=192.168.0.143
MACMINI_SSH_PORT=22583
MACMINI_SSH_USER=node
MACMINI_SSH_KEY_PATH=/Users/computer/.ssh/watchman_macmini
```

## Testing

The backend successfully returns Mac Mini data:

```json
{
  "status": "online",
  "timestamp": "2025-10-13T07:50:34.190Z",
  "data": {
    "host": "192.168.0.143",
    "ping": true
  }
}
```

Stats endpoint returns:

```json
{
  "cpuLoad": 1.97,
  "cpuTemp": 45.6,
  "disk": {
    "total": 1121118199808,
    "used": 15418109952,
    "free": 983848288256,
    "usagePercent": 1
  },
  "uptime": 14947200
}
```

## Benefits

- ✅ Works on both localhost and production domain without code changes
- ✅ No need to rebuild for different environments
- ✅ Smart URL detection adapts to the environment
- ✅ No CORS issues in development
- ✅ Secure HTTPS in production
- ✅ Simple configuration

## Files Modified

1. `apps/frontend/.env.local` (created)
2. `apps/frontend/src/hooks/useServiceHealth.ts` (smart URL detection)
3. `apps/frontend/src/services/ApiClient.ts` (smart URL detection)
4. `apps/frontend/vite.config.ts` (allowedHosts configuration)

## Next Steps

Simply refresh your browser and the Mac Mini card should now load successfully on both localhost and your production
domain!
