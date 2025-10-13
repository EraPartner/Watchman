# Update Notification Implementation

## Overview

Implemented comprehensive update checking and version tracking for all major services in the Watchman Dashboard.

## Services with Update Notifications

### 1. **AdGuard Home**

- **Endpoint**: `GET /api/adguard/updates`
- **Current Version Source**: AdGuard API `/control/status`
- **Latest Version Source**: AdGuard API (built-in `new_version` field)
- **Status Endpoint**: `/api/adguard/status` now includes `currentVersion`

### 2. **Bitcoin Core**

- **Endpoint**: `GET /api/bitcoin/updates`
- **Current Version Source**: Bitcoin RPC `getnetworkinfo` (subversion field)
- **Latest Version Source**: GitHub API (bitcoin/bitcoin releases)
- **Status Endpoint**: `/api/bitcoin/status` now includes `currentVersion`

### 3. **Tor Relay**

- **Endpoint**: `GET /api/tor/updates`
- **Current Version Source**: Onionoo API (relay version)
- **Latest Version Source**: Tor Project consensus health page
- **Status Endpoint**: `/api/tor/status` now includes `currentVersion` (newly added)

### 4. **IPFS (Kubo)**

- **Endpoint**: `GET /api/ipfs/updates`
- **Current Version Source**: IPFS API `/api/v0/version`
- **Latest Version Source**: GitHub API (ipfs/kubo releases)
- **Status Endpoint**: `/api/ipfs/status` now includes `currentVersion`

### 5. **Homebridge**

- **Endpoint**: `GET /api/homebridge/updates`
- **Current Version Source**: Homebridge API `/api/status/homebridge-version`
- **Latest Version Source**: npm registry (homebridge package)
- **Status Endpoint**: `/api/homebridge/status` now includes `currentVersion`

## API Response Format

All `/api/{service}/updates` endpoints return a consistent format:

```json
{
  "currentVersion": "1.2.3",
  "updateAvailable": true,
  "latestVersion": "1.2.4",
  "releaseUrl": "https://..."
}
```

All `/api/{service}/status` endpoints now include:

```json
{
  "status": "online",
  "currentVersion": "1.2.3",
  "timestamp": "2025-10-13T...",
  ...
}
```

## Version Comparison Logic

### Standard Semantic Versioning (AdGuard, Bitcoin, IPFS, Homebridge)

- Compares major.minor.patch
- Returns `updateAvailable: true` if any part of latest version is higher

### Tor Relay (Extended Versioning)

- Compares major.minor.patch.build (e.g., 0.4.8.10)
- Handles 4-part version numbers

## Implementation Details

### Service Changes

1. **HomebridgeService.js**
    - Updated `checkHealth()` to fetch both status and version in parallel
    - Extracts version from multiple possible response formats
    - Added `checkForUpdates()` method using npm registry

2. **AdGuardService.js**
    - Updated `checkHealth()` to include version from status API
    - `checkForUpdates()` uses built-in AdGuard update detection

3. **BitcoinService.js**
    - Updated `checkHealth()` to fetch networkinfo for version
    - Added version string cleaning (handles `/Satoshi:27.0.0/` format)
    - `checkForUpdates()` fetches from GitHub releases

4. **IpfsService.js**
    - Updated `checkHealth()` to include version (renamed from `version` to `currentVersion`)
    - `checkForUpdates()` fetches from GitHub kubo releases

5. **TorService.js**
    - Updated `checkHealth()` to extract version from relay info
    - `checkForUpdates()` scrapes Tor consensus health page for recommended version

### Server Endpoints

Added/Updated endpoints:

- `GET /api/adguard/updates` (new)
- `GET /api/tor/status` (new - previously only had /health)
- Updated all status endpoints to return `currentVersion`

## Usage Example

### Check if Homebridge needs updating:

```bash
curl http://localhost:3001/api/homebridge/updates
```

Response:

```json
{
  "currentVersion": "2.0.0",
  "updateAvailable": false,
  "latestVersion": "2.0.0",
  "releaseUrl": "https://www.npmjs.com/package/homebridge"
}
```

### Check current version in status:

```bash
curl http://localhost:3001/api/homebridge/status
```

Response:

```json
{
  "status": "online",
  "currentVersion": "2.0.0",
  "responseTime": 123,
  "timestamp": "2025-10-13T...",
  "data": { ... }
}
```

## Frontend Integration

The frontend can now:

1. Display current version for each service
2. Show update badges when `updateAvailable: true`
3. Link to release pages for manual updates
4. Poll update endpoints periodically to notify users

## Notes

- All update checks use proper user agents
- GitHub API calls don't require authentication (public endpoints)
- npm registry queries are rate-limited but generous for public packages
- Tor consensus health scraping is reliable but may need adjustment if HTML format changes
- AdGuard's built-in update detection is the most reliable (direct from their servers)

## Future Enhancements

- Add update notifications to WebSocket events
- Implement update badges in the frontend UI
- Add automatic update scheduling (where possible)
- Create a unified updates overview dashboard page
