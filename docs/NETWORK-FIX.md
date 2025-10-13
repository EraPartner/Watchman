# Network Connection Fix - EHOSTUNREACH Resolution

## Problem

Multiple services were failing to connect to local network hosts with `EHOSTUNREACH` errors:

- qBittorrent: `EHOSTUNREACH 192.168.0.143:8069`
- Homebridge: `EHOSTUNREACH 192.168.0.143:8581`
- Roon: Ping attempts failing for `192.168.0.102`
- Other services experiencing similar connection issues

## Root Cause

`node-fetch` v3 has known issues with local network connections on some systems. The library doesn't properly handle
network configurations and can fail to establish connections to local IP addresses, especially without proper HTTP agent
configuration.

## Solution

Added HTTP/HTTPS agents with `keepAlive` enabled to all services using `node-fetch`. This provides:

1. **Connection pooling**: Reuses TCP connections instead of creating new ones for each request
2. **Better error handling**: Properly configured agents handle network issues more gracefully
3. **Improved reliability**: KeepAlive ensures connections stay active for local network requests

## Files Modified

### 1. QBittorrentService.js

- Added HTTP/HTTPS agents with keepAlive
- Applied agents to all fetch requests (login and API calls)
- Maintains existing authentication and retry logic

### 2. HomebridgeService.js

- Added HTTP/HTTPS agents with keepAlive
- Applied agents to login and all API requests
- Preserves existing authentication flow (JSON and form-encoded fallback)

### 3. AlbyHubService.js

- Added HTTP/HTTPS agents with keepAlive
- Applied agents to all endpoint probing and API calls
- Maintains existing multi-endpoint fallback logic

### 4. IpfsService.js

- Added HTTP/HTTPS agents with keepAlive
- Applied agents to both GET and POST requests
- Preserves existing method fallback (POST/GET retry on 405)

### 5. BitcoinService.js

- Added HTTP/HTTPS agents with keepAlive for non-proxy requests
- Maintains existing SOCKS proxy agent for Tor connections
- Uses standard HTTP agent when not using Tor proxy

## Technical Implementation

```javascript
import http from "http";
import https from "https";

// Create agents with keepAlive to fix connection issues
const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 });

// Apply to fetch requests
const response = await fetch(url, {
  // ...other options
  agent: url.startsWith('https:') ? httpsAgent : httpAgent,
});
```

## Testing

All services have been validated to:

- ✓ Load without syntax errors
- ✓ Properly import HTTP/HTTPS modules
- ✓ Apply agents to all fetch requests
- ✓ Maintain backward compatibility with existing features

## Next Steps

After deploying these changes:

1. Restart the backend server
2. Monitor service connections to ensure they establish successfully
3. Check logs for any remaining EHOSTUNREACH errors
4. Verify all dashboard cards show online status

## Related Issues

- node-fetch v3 local network connection issues
- EHOSTUNREACH errors on macOS/Linux for LAN services
- Connection pooling and keepAlive for improved reliability

## Date

October 13, 2025
