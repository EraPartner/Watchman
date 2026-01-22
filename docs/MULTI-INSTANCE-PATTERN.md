# Multi-Instance Service Initialization Helper

This document provides a template for adding multi-instance support to services in ServiceManager.js

## Pattern for Each Service

```javascript
// Initialize SERVICE_NAME service(s) - support multiple instances
if (enabledServices.has("servicename")) {
  const instances = parseServiceInstances("servicename");
  
  if (instances.length > 0) {
    const instanceIds = [];
    instances.forEach((instance) => {
      const serviceInstance = new ServiceClass({
        // Map instance config to service config
        url: instance.url || fallback,
        username: instance.username || fallback,
        // ... other configs
        instanceId: instance.instanceId,
        instanceNumber: instance.instanceNumber,
      });
      this.services.set(instance.instanceId, serviceInstance);
      instanceIds.push(instance.instanceId);
    });
    this.serviceInstances.set("servicename", instanceIds);
  } else {
    // Legacy single instance
    const serviceInstance = new ServiceClass({
      // Use env vars directly
    });
    this.services.set("servicename", serviceInstance);
    this.serviceInstances.set("servicename", ["servicename"]);
  }
}
```

## Services to Update

- [x] qBittorrent (already done)
- [ ] Bitcoin
- [ ] AdGuard
- [ ] Tor
- [ ] Synology
- [ ] IPFS
- [ ] Roon
- [ ] Philips
- [ ] Homebridge
- [ ] MacMini
- [ ] AlbyHub
- [ ] Beryl (router)
- [ ] Telenet (router)
- [ ] Raspberry Pi
