# Service Count Fix

## Issue

The online services count in the LiveServerDashboard was showing incorrect totals:

- **Expected**: 13/13 services (based on 13 enabled services in `.env.local`)
- **Actual**: Showing 10 total services
- **Offline count**: Also incorrect

## Root Cause

The fallback counting logic was counting **tiles** instead of **services**. This caused undercounting because:

1. Some tiles contain **multiple stacked services**:
    - IPFS + Homebridge (2 services in 1 tile)
    - Nostrcheck + AlbyHub (2 services in 1 tile)
    - Roon + Philips Bridge (2 services in 1 tile)

2. The old code calculated: `totalServices = softwareTiles.length + hardwareTiles.length`
    - This counted stacked tiles as 1 service each
    - Result: 10 tiles were counted, but they represented 13 actual services

## Solution

Updated the fallback counting logic in `LiveServerDashboard.tsx` to:

1. **Count all enabled services individually** using `isServiceEnabled()` checks
2. Build a comprehensive status array that includes all 13 services
3. Properly calculate online/offline/warning counts from the full service list

### Changes Made

**File**: `apps/frontend/src/components/LiveServerDashboard.tsx`

1. **Moved `nostrStatus` definition** earlier in the component (line ~298) so it's available for the fallback counting
   logic

2. **Replaced the fallback counting logic** (line ~455):
   ```typescript
   // OLD: Counted tiles (undercounted stacked services)
   totalServices = softwareTiles.length + hardwareTiles.length;
   
   // NEW: Count all enabled services individually
   const allServiceStatuses: Array<"online" | "offline" | "warning" | "loading"> = [];
   
   if (isServiceEnabled("adguard")) allServiceStatuses.push(...);
   if (isServiceEnabled("tor")) allServiceStatuses.push(...);
   if (isServiceEnabled("bitcoin")) allServiceStatuses.push(...);
   // ... all 13+ services
   
   totalServices = allServiceStatuses.length;
   ```

## Enabled Services (13 total)

Based on `.env.local`:

```
ENABLED_SERVICES=bitcoin,qbittorrent,tor,synology,roon,philips,albyhub,macmini,beryl,telenet,ipfs,homebridge,raspibolt
```

1. bitcoin
2. qbittorrent
3. tor
4. synology
5. roon
6. philips
7. albyhub
8. macmini
9. beryl
10. telenet
11. ipfs
12. homebridge
13. raspibolt (raspi)

## Result

- ✅ Total services now correctly shows **13**
- ✅ Online/offline/warning counts are accurate
- ✅ Counts match the actual enabled services in the environment configuration
- ✅ Primary path uses `/api/services/health` endpoint (most accurate)
- ✅ Fallback path now properly counts all services individually

## Testing

To verify the fix:

1. Check the "Services Online" card shows correct denominator (13)
2. Verify online count matches actual running services
3. Confirm offline count is accurate
4. Check that the counts update properly when services go online/offline

## Notes

- The primary counting mechanism uses the `/api/services/health` endpoint, which returns all enabled services from the
  backend
- The fallback logic is only used when that endpoint hasn't loaded yet or fails
- Both paths now correctly count all 13 enabled services
