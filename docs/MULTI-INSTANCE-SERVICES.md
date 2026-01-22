# Multi-Instance Service Support

Watchman now supports monitoring multiple instances of the same service type. This is useful when you have multiple
instances of services like qBittorrent, routers, or other applications running on different machines or ports.

## Configuration

### Environment Variable Format

To configure multiple instances of a service, use numbered prefixes in your `.env.local` file:

```bash
SERVICE_<NUMBER>_<CONFIG_KEY>=value
```

### Example: Multiple qBittorrent Instances

```bash
# Enable qbittorrent service
ENABLED_SERVICES=qbittorrent

# First qBittorrent instance
QBITTORRENT_1_URL=http://192.168.0.10:8080
QBITTORRENT_1_USERNAME=admin
QBITTORRENT_1_PASSWORD=password1
QBITTORRENT_1_TIMEOUT=5000

# Second qBittorrent instance
QBITTORRENT_2_URL=http://192.168.0.20:8080
QBITTORRENT_2_USERNAME=admin
QBITTORRENT_2_PASSWORD=password2
QBITTORRENT_2_TIMEOUT=5000

# Third qBittorrent instance
QBITTORRENT_3_URL=http://192.168.0.30:8080
QBITTORRENT_3_USERNAME=admin
QBITTORRENT_3_PASSWORD=password3
```

## Supported Services

Currently, the following services support multiple instances:

- **qBittorrent**: Monitor multiple torrent clients
- (More services can be added in the future)

## Backward Compatibility

The legacy single-instance configuration format is still fully supported. If you don't use numbered prefixes, the
service will work as before:

```bash
# Legacy format (still works)
QBITTORRENT_URL=http://192.168.0.143:8069
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=mypassword
```

## How It Works

### Backend

1. **Configuration Parsing**: The `parseServiceInstances()` function in `config.js` scans environment variables for
   numbered patterns
2. **Service Initialization**: `ServiceManager` creates separate service instances for each numbered configuration
3. **Instance Tracking**: Each instance gets a unique ID (e.g., `qbittorrent_1`, `qbittorrent_2`)
4. **API Endpoints**: Health and stats endpoints return data for all instances

### Frontend

The dashboard automatically displays multiple cards when multiple instances are detected:

- Each instance gets its own card in the dashboard
- Cards are labeled with their instance number or custom name
- All standard monitoring features work per instance

## API Changes

### Health Endpoint

The `/api/services/health` endpoint returns health for all instances:

```json
{
  "services": {
    "qbittorrent_1": {
      "status": "online",
      "timestamp": "2026-01-21T..."
    },
    "qbittorrent_2": {
      "status": "online",
      "timestamp": "2026-01-21T..."
    }
  },
  "timestamp": "2026-01-21T..."
}
```

### Instances Endpoint

New endpoint `/api/services/instances` returns metadata about all service instances:

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
  "timestamp": "2026-01-21T..."
}
```

## Adding Multi-Instance Support to Other Services

To add multi-instance support to a service:

1. **Update ServiceManager.js**: Modify the service initialization to use `parseServiceInstances()`
2. **Update Service Class**: Ensure the service accepts `instanceId` and `instanceNumber` parameters
3. **Test Configuration**: Add numbered environment variables
4. **Update Frontend**: Ensure the card component handles multiple instances

### Example Pattern

```javascript
// In ServiceManager.js
if (enabledServices.has("myservice")) {
  const instances = parseServiceInstances("myservice");

  if (instances.length > 0) {
    const instanceIds = [];
    instances.forEach((instance) => {
      const service = new MyService({
        url: instance.url,
        timeout: parseInt(instance.timeout) || 5000,
        instanceId: instance.instanceId,
        instanceNumber: instance.instanceNumber,
      });
      this.services.set(instance.instanceId, service);
      instanceIds.push(instance.instanceId);
    });
    this.serviceInstances.set("myservice", instanceIds);
  }
}
```

## Troubleshooting

### Multiple instances not showing

1. Check your `.env.local` has numbered prefixes (e.g., `QBITTORRENT_1_URL`)
2. Verify the service is enabled in `ENABLED_SERVICES`
3. Check backend logs for initialization errors
4. Restart the backend server after changing `.env.local`

### Only one instance showing

1. Ensure instance numbers are sequential (1, 2, 3...)
2. Each instance needs at least one configuration variable with the numbered prefix
3. Check the `/api/services/instances` endpoint to see detected instances

### Instance not connecting

1. Verify the URL/host is correct for that instance
2. Check network connectivity to that specific instance
3. Verify credentials are correct for that instance
4. Check the service's own logs

## Future Enhancements

Potential improvements for multi-instance support:

- Custom display names for instances (e.g., `QBITTORRENT_1_NAME="Home Server"`)
- Grouping related instances in the UI
- Aggregate statistics across all instances of a service
- Per-instance refresh intervals
- Instance health history and alerts
