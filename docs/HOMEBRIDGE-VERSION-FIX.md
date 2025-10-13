# Homebridge Version Fix

## Problem

The Homebridge updates endpoint (`/api/homebridge/updates`) was not returning the correct current version, showing the
error: "Could not determine current Homebridge version".

## Root Cause

The `checkForUpdates()` method was calling `makeRequest()` directly to fetch version data and then trying to parse it
independently. This approach was inconsistent with how the status endpoint (which works correctly) retrieves the
version.

## Solution

Changed `checkForUpdates()` to use the **exact same method** as the status endpoint:

- Both now call `checkHealth()` to get the current version
- This ensures complete consistency between the status card and update notifications
- The version extraction logic is centralized in `checkHealth()`, which already handles all the different Homebridge API
  response formats correctly

## Changes Made

Updated `/apps/backend/services/HomebridgeService.js`:

### Before (checkForUpdates method)

```javascript
async
checkForUpdates()
{
  try {
    // Called makeRequest() directly and tried to parse version independently
    const versionData = await this.makeRequest(this.versionPath);
    let currentVersion = "unknown";
    if (versionData && typeof versionData === "object") {
      currentVersion = versionData.version || versionData.homebridgeVersion ||
    ...
    }
    // ... rest of code
  }
}
```

### After (checkForUpdates method)

```javascript
async
checkForUpdates()
{
  try {
    // Use checkHealth() - same as status endpoint
    const healthData = await this.checkHealth();

    // Extract current version from health data
    let currentVersion = "unknown";
    if (healthData && healthData.currentVersion && healthData.currentVersion !== "unknown") {
      currentVersion = healthData.currentVersion;
    }
    // ... rest of code
  }
}
```

## How It Works

1. **Status Endpoint** (`/api/homebridge/status`):
    - Calls `serviceManager.getServiceHealth("homebridge")`
    - Which calls `HomebridgeService.checkHealth()`
    - Returns data including `currentVersion`

2. **Updates Endpoint** (`/api/homebridge/updates`):
    - Now also calls `HomebridgeService.checkHealth()`
    - Extracts the same `currentVersion` field
    - Uses it to check for updates against npm registry

## Impact

- ✅ Updates endpoint now returns the correct current version
- ✅ Complete consistency between status and updates endpoints
- ✅ Simplified code with centralized version extraction logic
- ✅ No duplicate parsing logic to maintain

## Testing

The fix ensures that if the status card shows the correct version, the updates endpoint will too, since they now use
identical logic.