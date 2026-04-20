---
title: Multi-Instance Support
type: feature
status: active
date: 2026-04-02
tags: [feature, backend, services, configuration]
description: Multi-instance service support - run multiple nodes of the same service type
aliases: [multi-instance, multiple instances, service instances]
---

# Multi-Instance Support

> [!abstract] Overview
> Watchman supports running multiple instances of the same service type, useful for monitoring several nodes of the same software.

## Configuration

### Environment Variables

Use numbered prefixes for each instance:

```bash
# qBittorrent Instance 1
QBITTORRENT_1_URL=http://192.0.2.10:8080
QBITTORRENT_1_USERNAME=admin
QBITTORRENT_1_PASSWORD=password1

# qBittorrent Instance 2
QBITTORRENT_2_URL=http://192.0.2.11:8080
QBITTORRENT_2_USERNAME=admin
QBITTORRENT_2_PASSWORD=password2
```

### Legacy Single Instance

Legacy single-instance configuration is still supported:

```bash
QBITTORRENT_URL=http://127.0.0.1:8069
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-password
```

## Supported Services

Services that support multi-instance:

- qBittorrent
- Synology
- Roon
- Philips Hue
- Mac Mini
- Alby Hub
- Raspberry Pi
- Router (Beryl/Telenet)

## API Pattern

Multi-instance services use the route pattern:

```
GET /api/{serviceType}_{instanceNum}/status
GET /api/{serviceType}_{instanceNum}/stats
```

Examples:

- `/api/qbittorrent_1/status`
- `/api/qbittorrent_2/stats`
- `/api/synology_1/status`

## Instance Discovery

The `GET /api/services/instances` endpoint returns metadata about all configured instances:

```json
{
  "instances": {
    "qbittorrent": {
      "count": 2,
      "instances": [
        { "id": "qbittorrent_1", "type": "qbittorrent" },
        { "id": "qbittorrent_2", "type": "qbittorrent" }
      ]
    }
  },
  "timestamp": "2026-04-02T..."
}
```

## Implementation

Instance parsing is handled in `apps/backend/config.js` via `parseServiceInstances()`:

1. Scans `process.env` for `{SERVICE}_{N}_` pattern
2. Collects all env vars for each instance number
3. Falls back to legacy single-instance config if no numbered instances found

## PlantUML Diagrams

### Instance Configuration Pattern

```plantuml
@startuml
!theme plain

database "Environment Variables" as Env

package "Instance 1" {
    [QBITTORRENT_1_URL]
    [QBITTORRENT_1_USERNAME]
    [QBITTORRENT_1_PASSWORD]
}

package "Instance 2" {
    [QBITTORRENT_2_URL]
    [QBITTORRENT_2_USERNAME]
    [QBITTORRENT_2_PASSWORD]
}

package "Legacy" {
    [QBITTORRENT_URL]
    [QBITTORRENT_USERNAME]
    [QBITTORRENT_PASSWORD]
}

Env --> QBITTORRENT_1_URL
Env --> QBITTORRENT_1_USERNAME
Env --> QBITTORRENT_1_PASSWORD

Env --> QBITTORRENT_2_URL
Env --> QBITTORRENT_2_USERNAME
Env --> QBITTORRENT_2_PASSWORD
@enduml
```

### Multi-Instance API Routing

```plantuml
@startuml
!theme plain

actor "Frontend" as FE
participant "Backend" as BE
participant "ServiceManager" as SvcMgr
participant "QBittorrent Instance 1" as QB1
participant "QBittorrent Instance 2" as QB2

FE -> BE : GET /api/qbittorrent_1/status
BE -> SvcMgr : Route to qbittorrent_1
SvcMgr -> QB1 : checkHealth()
QB1 --> SvcMgr : {status: online}
SvcMgr --> BE : Response
BE --> FE : {serviceId: qbittorrent_1, status: online}

FE -> BE : GET /api/qbittorrent_2/stats
BE -> SvcMgr : Route to qbittorrent_2
SvcMgr -> QB2 : getStats()
QB2 --> SvcMgr : {torrents: 42, download: 1.2MB/s}
SvcMgr --> BE : Response
BE --> FE : {serviceId: qbittorrent_2, ...}
@enduml
```

### Instance Discovery Flow

```plantuml
@startuml
!theme plain

participant "Config" as Cfg
participant "parseServiceInstances" as Parser
participant "Environment" as Env

Cfg -> Parser : parseServiceInstances('qbittorrent')
Parser -> Env : Scan for QBITTORRENT_*

alt Found Numbered Instances
    Parser -> Parser : Group by instance number
    Parser --> Cfg : Array of instance configs
else No Numbered Instances
    Parser -> Env : Fall back to QBITTORRENT_*
    Parser -> Parser : Create single instance
    Parser --> Cfg : Array with one instance
end

note over Cfg
  Result:
  [
    { id: "qbittorrent_1", ... },
    { id: "qbittorrent_2", ... }
  ]
end note
@enduml
```

## Related

- [[docs/features/service-monitoring|Service Monitoring]]
- [[docs/reference/environment-variables|Environment Variables]]
- `apps/backend/config.js`
