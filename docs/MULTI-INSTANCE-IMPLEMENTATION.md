# Multi-Instance Service Support Implementation Summary

**Date**: January 21, 2026  
**Feature**: Support for multiple cards/instances of the same service type

## Overview

Implemented comprehensive support for monitoring multiple instances of the same service (e.g., multiple qBittorrent
servers) with separate cards in the dashboard.

## What Was Implemented

### Backend Changes

#### 1. Configuration Parser (`apps/backend/config.js`)

- Added `parseServiceInstances()` function to detect numbered environment variables
- Supports pattern: `SERVICE_<NUMBER>_<CONFIG_KEY>` (e.g., `QBITTORRENT_1_URL`, `QBITTORRENT_2_URL`)
- Falls back to legacy single-instance format for backward compatibility
- Exports function for use by ServiceManager

#### 2. Service Manager (`apps/backend/services/ServiceManager.js`)

- Added `serviceInstances` Map to track multiple instances per service type
- Updated qBittorrent initialization to support multiple instances
- Each instance gets unique ID (e.g., `qbittorrent_1`, `qbittorrent_2`)
- Added methods:
    - `getServiceInstances(serviceType)` - Returns array of instance IDs for a service
    - `getServiceTypes()` - Returns all service types with instances

#### 3. API Endpoints (`apps/backend/server.js`)

- **New endpoint**: `GET /api/services/instances` - Returns metadata about all service instances
- **Dynamic routes**: `GET /api/:serviceId(\\w+_\\d+)/status` and `/stats` for instance-specific queries
- Updated `GET /api/services/health` to return health for all instances
- Updated `GET /api/config/frontend` to support multi-instance qBittorrent config

### Frontend Changes

#### 1. API Client (`apps/frontend/src/services/ApiClient.ts`)

- Added `getServiceInstances()` method
- Added generic `getServiceHealth(serviceKey)` method
- Added generic `getServiceStats(serviceKey)` method

#### 2. Service Instances Hook (`apps/frontend/src/hooks/useServiceInstances.tsx`)

- New React hook for querying service instances
- Provides:
    - `getInstances(serviceType)` - Get all instances of a service
    - `getInstanceCount(serviceType)` - Count instances
    - `hasMultipleInstances(serviceType)` - Check if multiple instances exist

#### 3. QBittorrent Card (`apps/frontend/src/components/QBittorrentCard.tsx`)

- Added support for `instanceId` and `instanceNumber` props
- Displays instance number in card title (e.g., "qBittorrent #2")
- Fetches data from instance-specific API endpoints

#### 4. Dashboard (`apps/frontend/src/components/LiveServerDashboard.tsx`)

- Uses `useServiceInstances()` hook
- Dynamically renders multiple cards when multiple instances detected
- Falls back to single card for legacy configuration

## Configuration Format

### Multi-Instance (New)

```bash
QBITTORRENT_1_URL=http://server1:8080
QBITTORRENT_1_USERNAME=admin
QBITTORRENT_1_PASSWORD=pass1

QBITTORRENT_2_URL=http://server2:8080
QBITTORRENT_2_USERNAME=admin
QBITTORRENT_2_PASSWORD=pass2
```

### Single Instance (Legacy - Still Works)

```bash
QBITTORRENT_URL=http://192.168.0.143:8069
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=mypassword
```

## API Response Examples

### Service Instances Endpoint

```json
{
  "instances": {
    "qbittorrent": {
      "count": 2,
      "instances": [
        {"id": "qbittorrent_1", "type": "qbittorrent"},
        {"id": "qbittorrent_2", "type": "qbittorrent"}
      ]
    }
  },
  "timestamp": "2026-01-21T12:00:00.000Z"
}
```

### Service Health Endpoint (Multi-Instance)

```json
{
  "services": {
    "qbittorrent_1": {
      "status": "online",
      "responseTime": 45,
      "timestamp": "2026-01-21T12:00:00.000Z"
    },
    "qbittorrent_2": {
      "status": "online",
      "responseTime": 52,
      "timestamp": "2026-01-21T12:00:00.000Z"
    }
  },
  "timestamp": "2026-01-21T12:00:00.000Z"
}
```

## Files Modified

### Backend

- `apps/backend/config.js` - Added multi-instance parser
- `apps/backend/services/ServiceManager.js` - Instance tracking and initialization
- `apps/backend/server.js` - Dynamic routes and endpoints
- `apps/backend/.env.example` - Documentation

### Frontend

- `apps/frontend/src/services/ApiClient.ts` - API methods
- `apps/frontend/src/hooks/useServiceInstances.tsx` - New hook
- `apps/frontend/src/components/QBittorrentCard.tsx` - Instance support
- `apps/frontend/src/components/LiveServerDashboard.tsx` - Dynamic rendering

### Documentation

- `docs/MULTI-INSTANCE-SERVICES.md` - Comprehensive guide
- `docs/MULTI-INSTANCE-EXAMPLE.md` - Configuration example

## Backward Compatibility

✅ **Fully backward compatible**

- Legacy single-instance configuration still works
- No breaking changes to existing setups
- Falls back gracefully when no numbered instances found

## Testing

To test the implementation:

1. **Configure multiple instances** in `.env.local`:
   ```bash
   QBITTORRENT_1_URL=http://server1:8080
   QBITTORRENT_2_URL=http://server2:8080
   ```

2. **Restart backend**:
   ```bash
   cd apps/backend && npm start
   ```

3. **Check instances API**:
   ```bash
   curl http://localhost:3001/api/services/instances
   ```

4. **View dashboard** - Should show multiple qBittorrent cards

## Future Enhancements

Potential improvements:

- [ ] Custom display names (e.g., `QBITTORRENT_1_NAME="Home Server"`)
- [ ] Support for other services (AdGuard, Synology, etc.)
- [ ] Instance grouping in UI
- [ ] Aggregate statistics across instances
- [ ] Per-instance refresh intervals
- [ ] Instance-specific alerts

## Known Limitations

1. Instance numbers must be sequential (1, 2, 3, not 1, 3, 5)
2. Currently only qBittorrent fully supports multi-instance
3. Frontend TypeScript may show warnings (non-blocking)

## Support

See documentation:

- `/docs/MULTI-INSTANCE-SERVICES.md` - Full documentation
- `/docs/MULTI-INSTANCE-EXAMPLE.md` - Configuration examples
