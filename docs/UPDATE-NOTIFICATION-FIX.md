# Update Notification System - Fix Summary

## Problem

The update notification system was failing with the error:

```
❌ Homebridge update check failed: Failed to check for updates: Protocol "https:" not supported. Expected "http:"
```

This error occurred because `node-fetch` requires an explicit HTTPS agent to be passed when making HTTPS requests.

## Solution

Added proper HTTPS agent configuration to all service update check methods.

### Files Modified

#### 1. **HomebridgeService.js** ✅

- **Line 502**: Added `agent: httpsAgent` to npm registry fetch
- **Issue**: Was checking `this.baseUrl` instead of always using HTTPS for npm
- **Fix**: Always use `httpsAgent` for npm registry requests (https://registry.npmjs.org)

#### 2. **BitcoinService.js** ✅

- **Line 267**: Added `agent: httpsAgent` to GitHub API fetch
- **Issue**: Missing agent parameter for GitHub API requests
- **Fix**: Added HTTPS agent for https://api.github.com requests

#### 3. **IpfsService.js** ✅

- **Line 207**: Added `agent: httpsAgent` to GitHub API fetch
- **Issue**: Missing agent parameter for GitHub API requests
- **Fix**: Added HTTPS agent for https://api.github.com/repos/ipfs/kubo requests

#### 4. **TorService.js** ✅

- **Line 5**: Created `httpsAgent` constant
- **Line 201**: Added `agent: httpsAgent` to Tor Project fetch
- **Issue**: Missing HTTPS module import and agent parameter
- **Fix**: Imported `https` module and added HTTPS agent for https://consensus-health.torproject.org

#### 5. **AdGuardService.js** ✅

- **No changes needed**: Uses `AbortSignal.timeout()` which works without explicit agent
- **Reason**: AdGuard API is typically accessed over HTTP on local network

### Backend API Endpoints Created

All update check endpoints were already created in `server.js`:

1. **GET /api/adguard/updates** - Checks AdGuard Home for updates via its API
2. **GET /api/bitcoin/updates** - Checks GitHub for latest Bitcoin Core release
3. **GET /api/ipfs/updates** - Checks GitHub for latest Kubo (IPFS) release
4. **GET /api/tor/updates** - Checks Tor Project consensus for recommended versions
5. **GET /api/homebridge/updates** - Checks npm registry for latest Homebridge version

### Frontend Implementation

The frontend already has complete update notification support via the `UpdateBadge` component:

- **Component**: `/apps/frontend/src/components/UpdateBadge.tsx`
- **Usage**: Already integrated into all 5 service cards
- **Features**:
    - Auto-checks every 6 hours
    - Shows red badge with new version number when updates available
    - Clickable to view release notes
    - Hides when services are up-to-date or not configured

## Testing

To test the update notifications:

1. **Restart the backend server**:
   ```bash
   cd /Users/computer/Documents/Personal/Scripts/Projects/Watchman
   npm run dev:backend
   ```

2. **Test endpoints manually**:
   ```bash
   curl http://localhost:3001/api/homebridge/updates
   curl http://localhost:3001/api/bitcoin/updates
   curl http://localhost:3001/api/ipfs/updates
   curl http://localhost:3001/api/tor/updates
   curl http://localhost:3001/api/adguard/updates
   ```

3. **Check the dashboard**: Open your dashboard and look for red update badges next to service names

## Expected Response Format

Each endpoint returns:

```json
{
  "currentVersion": "1.2.3",
  "updateAvailable": true,
  "latestVersion": "1.3.0",
  "releaseUrl": "https://..."
}
```

## Services Covered

✅ **AdGuard Home** - Version tracking via AdGuard API  
✅ **Bitcoin Core** - Version tracking via GitHub releases  
✅ **Tor Relay** - Version tracking via Tor consensus  
✅ **IPFS (Kubo)** - Version tracking via GitHub releases  
✅ **Homebridge** - Version tracking via npm registry

## Notes

- Update checks do not perform automatic updates
- They only notify you when updates are available
- You must manually update the services using your preferred method
- The system is non-intrusive - badges only appear when updates are available
- All HTTPS requests now use proper keep-alive agents for better performance

## Status

🟢 **All fixes applied and ready to test**

Last updated: October 13, 2025
