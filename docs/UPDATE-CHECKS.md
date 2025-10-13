# Update Check Endpoints

This document describes the update notification endpoints available in the Watchman dashboard.

## Overview

The dashboard provides update check endpoints for the following services:

- AdGuard Home
- Bitcoin Core
- Tor Relay
- IPFS (Kubo)
- Homebridge

**Note:** These endpoints only check if updates are available. They do not perform automatic updates.

## API Endpoints

### AdGuard Home

```
GET /api/adguard/updates
```

**Response:**

```json
{
  "currentVersion": "v0.107.43",
  "updateAvailable": true,
  "latestVersion": "v0.107.44",
  "canAutoUpdate": false
}
```

### Bitcoin Core

```
GET /api/bitcoin/updates
```

**Response:**

```json
{
  "currentVersion": "27.0.0",
  "updateAvailable": true,
  "latestVersion": "27.1.0",
  "releaseUrl": "https://github.com/bitcoin/bitcoin/releases/tag/v27.1.0"
}
```

### Tor Relay

```
GET /api/tor/updates
```

**Response:**

```json
{
  "currentVersion": "0.4.8.10",
  "updateAvailable": false,
  "latestVersion": "0.4.8.10"
}
```

### IPFS (Kubo)

```
GET /api/ipfs/updates
```

**Response:**

```json
{
  "currentVersion": "0.24.0",
  "updateAvailable": true,
  "latestVersion": "0.25.0",
  "releaseUrl": "https://github.com/ipfs/kubo/releases/tag/v0.25.0"
}
```

### Homebridge

```
GET /api/homebridge/updates
```

**Response:**

```json
{
  "currentVersion": "1.7.0",
  "updateAvailable": false,
  "latestVersion": "1.7.0",
  "releaseUrl": "https://github.com/homebridge/homebridge/releases/tag/v1.7.0"
}
```

## Implementation Details

### Version Comparison

- **AdGuard Home**: Uses the built-in AdGuard API which provides native update detection
- **Bitcoin Core**: Compares semantic versions (major.minor.patch) against GitHub releases
- **Tor**: Compares version strings from local installation against latest stable release
- **IPFS**: Compares semantic versions against Kubo GitHub releases
- **Homebridge**: Compares versions against npm registry or GitHub releases

### Caching

All update check endpoints use the stats cache middleware with the following behavior:

- Cache TTL: 5 minutes (default)
- Cached responses reduce API calls to external services (GitHub API)
- Cache can be cleared via: `POST /api/cache/clear`

### Rate Limiting

- Subject to general API rate limiting
- GitHub API has its own rate limits (60 requests/hour unauthenticated)

## Usage Examples

### Using curl

```bash
# Check AdGuard updates
curl http://localhost:3001/api/adguard/updates

# Check Bitcoin updates
curl http://localhost:3001/api/bitcoin/updates

# Check Tor updates
curl http://localhost:3001/api/tor/updates

# Check IPFS updates
curl http://localhost:3001/api/ipfs/updates

# Check Homebridge updates
curl http://localhost:3001/api/homebridge/updates
```

### Using fetch in JavaScript

```javascript
async function checkUpdates(service) {
  const response = await fetch(`http://localhost:3001/api/${service}/updates`);
  const data = await response.json();
  
  if (data.updateAvailable) {
    console.log(`Update available for ${service}!`);
    console.log(`Current: ${data.currentVersion}`);
    console.log(`Latest: ${data.latestVersion}`);
  } else {
    console.log(`${service} is up to date`);
  }
}

// Check all services
['adguard', 'bitcoin', 'tor', 'ipfs', 'homebridge'].forEach(checkUpdates);
```

## Frontend Integration

To display update notifications in the dashboard, you can:

1. **Poll periodically**: Check for updates every 6-12 hours
2. **Display badge/indicator**: Show a visual indicator when updates are available
3. **Show version info**: Display current vs latest version
4. **Link to release notes**: Use the `releaseUrl` field when available

### Example React Hook

```typescript
import { useEffect, useState } from 'react';

interface UpdateInfo {
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion: string;
  releaseUrl?: string;
}

export function useUpdateCheck(service: string, intervalMs = 21600000) { // 6 hours
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const response = await fetch(`/api/${service}/updates`);
        const data = await response.json();
        setUpdateInfo(data);
      } catch (error) {
        console.error(`Failed to check ${service} updates:`, error);
      }
    };
    
    checkUpdates();
    const interval = setInterval(checkUpdates, intervalMs);
    
    return () => clearInterval(interval);
  }, [service, intervalMs]);
  
  return updateInfo;
}
```

## Error Handling

All endpoints return appropriate error responses:

### Service Not Configured (503)

```json
{
  "error": "Service not configured"
}
```

### Update Check Failed (500)

```json
{
  "error": "Failed to check for updates",
  "message": "GitHub API rate limit exceeded"
}
```

## Notes

- Update checks require the respective service to be configured and running
- External services (Bitcoin, Tor, IPFS, Homebridge) fetch latest versions from GitHub
- AdGuard uses its own built-in update mechanism
- Consider implementing visual notifications in the dashboard UI
- Updates must be performed manually through each service's native interface
