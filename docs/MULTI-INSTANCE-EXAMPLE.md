# Multi-Instance Service Configuration Example

This example shows how to configure multiple instances of qBittorrent in your Watchman dashboard.

## Example Configuration

Add the following to your `apps/backend/.env.local` file:

```bash
# Enable qbittorrent service
ENABLED_SERVICES=bitcoin,tor,qbittorrent

# First qBittorrent instance (Server 1)
QBITTORRENT_1_URL=http://192.168.0.10:8080
QBITTORRENT_1_USERNAME=admin
QBITTORRENT_1_PASSWORD=password123
QBITTORRENT_1_TIMEOUT=5000

# Second qBittorrent instance (Server 2)
QBITTORRENT_2_URL=http://192.168.0.20:8080
QBITTORRENT_2_USERNAME=admin
QBITTORRENT_2_PASSWORD=password456
QBITTORRENT_2_TIMEOUT=5000

# Third qBittorrent instance (Server 3)
QBITTORRENT_3_URL=http://192.168.0.30:8080
QBITTORRENT_3_USERNAME=admin
QBITTORRENT_3_PASSWORD=password789
QBITTORRENT_3_TIMEOUT=5000
```

## Result

After restarting the backend server, you will see 3 separate qBittorrent cards in your dashboard:

- qBittorrent #1
- qBittorrent #2
- qBittorrent #3

Each card will:

- Monitor its own instance independently
- Show individual statistics (torrents, speeds, disk space)
- Display online/offline status separately
- Link to its respective web UI

## Testing

1. Save the configuration to `.env.local`
2. Restart the backend: `cd apps/backend && npm start`
3. Open the frontend dashboard
4. You should see multiple qBittorrent cards

## Verify Multi-Instance Setup

You can verify your configuration using the API endpoints:

```bash
# Check which instances are detected
curl http://localhost:3001/api/services/instances

# Check health of specific instance
curl http://localhost:3001/api/qbittorrent_1/status
curl http://localhost:3001/api/qbittorrent_2/status
curl http://localhost:3001/api/qbittorrent_3/status

# Get stats for specific instance
curl http://localhost:3001/api/qbittorrent_1/stats
```

## Troubleshooting

### Only seeing one card

Make sure:

1. Instance numbers are sequential (1, 2, 3, not 1, 3, 5)
2. Each instance has at least the URL configured
3. The service is in ENABLED_SERVICES
4. You've restarted the backend after changes

### Cards showing offline

Verify:

1. Each qBittorrent instance is actually running
2. URLs are correct and accessible
3. Credentials are correct
4. Firewalls aren't blocking connections

### Backend errors

Check backend logs for:

```bash
cd apps/backend
npm start
# Look for initialization messages about qbittorrent_1, qbittorrent_2, etc.
```
