# Multi-Instance Support - All Services Implementation Guide

This guide provides the complete implementation pattern to add multi-instance support for ALL services.

## Implementation Strategy

Instead of manually editing the large ServiceManager.js file repeatedly, we'll:

1. Document the pattern for each service
2. Provide configuration examples
3. Update each service systematically

## Service-by-Service Implementation

### Pattern Template

```javascript
// Initialize SERVICE_NAME service(s) - support multiple instances
if (enabledServices.has("servicename")) {
  const instances = parseServiceInstances("servicename");

  if (instances.length > 0) {
    const instanceIds = [];
    instances.forEach((instance) => {
      const serviceInstance = new ServiceClass({
        // Map config from instance object
        param1: instance.param1 || fallback,
        param2: parseInt(instance.param2) || default,
        instanceId: instance.instanceId,
        instanceNumber: instance.instanceNumber,
      });
      this.services.set(instance.instanceId, serviceInstance);
      instanceIds.push(instance.instanceId);
    });
    this.serviceInstances.set("servicename", instanceIds);
  } else {
    // Legacy single instance
    const serviceInstance = new ServiceClass({ /* env vars */ });
    this.services.set("servicename", serviceInstance);
    this.serviceInstances.set("servicename", ["servicename"]);
  }
}
```

## All Services Configuration Map

### 1. Bitcoin (bitcoin)

**Env Pattern**: `BITCOIN_<N>_*`

```bash
BITCOIN_1_RPC_URL=http://bitcoin1:8332
BITCOIN_1_RPC_USER=user1
BITCOIN_1_RPC_PASSWORD=pass1
BITCOIN_2_RPC_URL=http://bitcoin2:8332
```

### 2. AdGuard (adguard)

**Env Pattern**: `ADGUARD_<N>_*`

```bash
ADGUARD_1_URL=http://adguard1:3000
ADGUARD_1_AUTH=base64token1
ADGUARD_2_URL=http://adguard2:3000
```

### 3. Tor (tor)

**Env Pattern**: `TOR_<N>_*`

```bash
TOR_1_RELAY_NICKNAME=relay1
TOR_1_RELAY_IP=1.2.3.4
TOR_2_RELAY_NICKNAME=relay2
```

### 4. Synology (synology)

**Env Pattern**: `SYNOLOGY_<N>_*`

```bash
SYNOLOGY_1_HOST=192.168.0.100
SYNOLOGY_1_SNMP_USERNAME=watchman1
SYNOLOGY_2_HOST=192.168.0.200
```

### 5. IPFS (ipfs)

**Env Pattern**: `IPFS_<N>_*`

```bash
IPFS_1_HOST=192.168.0.10
IPFS_1_PORT=5001
IPFS_2_HOST=192.168.0.20
```

### 6. Roon (roon)

**Env Pattern**: `ROON_<N>_*`

```bash
ROON_1_HOST=192.168.0.150
ROON_1_PORTS=9003,9330
ROON_2_HOST=192.168.0.160
```

### 7. Philips Bridge (philips)

**Env Pattern**: `PHILIPS_<N>_*`

```bash
PHILIPS_1_BRIDGE_HOST=192.168.0.170
PHILIPS_2_BRIDGE_HOST=192.168.0.171
```

### 8. Homebridge (homebridge)

**Env Pattern**: `HOMEBRIDGE_<N>_*`

```bash
HOMEBRIDGE_1_URL=http://192.168.0.180:8581
HOMEBRIDGE_1_USERNAME=admin1
HOMEBRIDGE_2_URL=http://192.168.0.190:8581
```

### 9. Mac Mini (macmini)

**Env Pattern**: `MACMINI_<N>_*`

```bash
MACMINI_1_HOST=192.168.0.100
MACMINI_1_SSH_USER=node
MACMINI_1_SSH_KEY_PATH=/path/to/key1
MACMINI_2_HOST=192.168.0.110
```

### 10. Alby Hub (albyhub)

**Env Pattern**: `ALBYHUB_<N>_*`

```bash
ALBYHUB_1_URL=http://192.168.0.120:8080
ALBYHUB_1_TOKEN=token1
ALBYHUB_2_URL=http://192.168.0.130:8080
```

### 11. Routers (beryl/telenet)

**Env Pattern**: `BERYL_<N>_*` / `TELENET_<N>_*`

```bash
BERYL_1_HOST=192.168.45.1
BERYL_1_PORTS=234,53
BERYL_2_HOST=192.168.46.1
TELENET_1_HOST=192.168.0.1
```

### 12. Raspberry Pi (raspi)

**Env Pattern**: `RASPI_<N>_*`

```bash
RASPI_1_HOST=192.168.0.109
RASPI_1_PORT=8888
RASPI_2_HOST=192.168.0.110
```

## Automated Update Script

Run this to systematically update ServiceManager.js:

```bash
cd /Users/computer/Documents/Personal/Scripts/Projects/Watchman
node tools/update-all-services-multi-instance.js
```

## Manual Update Steps (if needed)

For each service in ServiceManager.js:

1. Find the service initialization block
2. Replace with multi-instance pattern
3. Add fallback to legacy config
4. Register in serviceInstances map
5. Test configuration

## Verification

After updating, verify:

```bash
# Check syntax
node --check apps/backend/services/ServiceManager.js

# Test with multi-instance config
QBITTORRENT_1_URL=http://test1 QBITTORRENT_2_URL=http://test2 node apps/backend/server.js

# Check instances API
curl http://localhost:3001/api/services/instances
```

## Frontend Updates Needed

Each service card component needs:

1. Accept `instanceId` and `instanceNumber` props
2. Use instance-specific API endpoints
3. Show instance number in title
4. Update LiveServerDashboard to render multiple cards

**Example for BitcoinCard**:

```typescript
interface BitcoinCardProps {
  instanceId?: string;
  instanceNumber?: number;
}

export const BitcoinCard: React.FC<BitcoinCardProps> = ({
                                                          instanceId = "bitcoin",
                                                          instanceNumber
                                                        }) => {
  const displayName = instanceNumber ? `Bitcoin #${instanceNumber}` : "Bitcoin";
  // ... use instanceId for API calls
}
```

## Testing Multi-Instance Setup

1. **Configure** multiple instances in `.env.local`
2. **Restart** backend
3. **Check logs** for initialization messages
4. **Test API**: `curl http://localhost:3001/api/services/instances`
5. **View dashboard** - should show multiple cards

## Common Issues

### Issue: Only seeing one instance

- Ensure numbers are sequential (1, 2, 3)
- Check each instance has required config vars
- Restart backend after config changes

### Issue: Cards not rendering

- Check frontend component has instanceId support
- Verify LiveServerDashboard renders multiple cards
- Check browser console for errors

### Issue: API errors

- Verify instance-specific endpoints work
- Check ServiceManager registered instances
- Confirm service config is valid

## Next Steps

1. Update ServiceManager.js for all services
2. Update all frontend card components
3. Update LiveServerDashboard for all services
4. Test each service with multi-instance config
5. Update documentation with examples
6. Create migration guide for existing users
