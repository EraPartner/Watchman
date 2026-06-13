---
title: Features
type: index
status: active
date: 2026-06-13
tags: [feature, index]
description: Index of all feature documentation for the Watchman project
aliases: [features index, feature docs]
---

# Features

> [!abstract] Overview
> Watchman's core features provide comprehensive monitoring of self-hosted services.

## Feature Index

```dataview
TABLE WITHOUT ID file.link AS "Feature", date AS "Date", status AS "Status"
FROM "docs/features"
WHERE type = "feature"
SORT file.name ASC
```

## Core Features

| Feature                            | Description              |
| ---------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| [[docs/features/service-monitoring | Service Monitoring]]     | Health checks and statistics for external services                         |
| [[docs/features/multi-instance     | Multi-Instance Support]] | Run multiple nodes of the same service type                                |
| [[docs/features/real-time-updates  | Real-Time Updates]]      | WebSocket-based status broadcasting                                        |
| [[docs/features/ui-configuration   | UI Configuration]]       | Runtime service CRUD from UI with encryption and hot-reload                |
| [[docs/features/profiles           | Service Profiles]]       | Named per-location service sets with gateway-MAC LAN auto-switch (ADR-027) |

> [!note] Removed Features
> Time-series history (persistent DuckDB-backed metrics with rollups and charting) was removed as part of [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]]. The dashboard now provides real-time status and recent activity in an in-memory buffer, lost on restart. See [[docs/features/time-series-history|Time-Series Feature (Archived)]] for historical context.

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/architecture/index|Architecture Overview]]

## PlantUML Diagrams

### Core Features Overview

```plantuml
@startuml
!theme plain

package "Service Monitoring" as SM {
    [Health Checks]
    [Statistics]
}

package "Multi-Instance" as MI {
    [Instance Discovery]
    [Instance Routing]
    [Instance Config]
}

package "Real-Time Updates" as RT {
    [WebSocket]
    [Status Broadcasting]
    [Auto Refresh]
}

package "Service Profiles" as PR {
    [ProfileStore]
    [NetworkWatcher]
    [Profile Switcher UI]
}

note right of SM
  14+ service types
  Standard interface
end note

note right of MI
  Multiple instances
  per service type
end note

note right of RT
  No polling
  Live updates
end note

note right of PR
  Per-location sets
  Gateway-MAC auto-switch
  Manual override
end note
@enduml
```

### Feature Integration

```plantuml
@startuml
!theme plain

[Frontend] --> [Service Monitoring]
[Frontend] --> [Multi-Instance]
[Frontend] --> [Real-Time Updates]
[Frontend] --> [Service Profiles]

[Service Monitoring] --> [Backend API]
[Multi-Instance] --> [Backend API]
[Real-Time Updates] --> [WebSocket]
[Service Profiles] --> [Backend API]

[Backend API] --> [Service Classes]
[Backend API] --> [Cache]
[Backend API] --> [ProfileStore]
[Backend API] --> [NetworkWatcher]

[Service Classes] --> [External Services]
[NetworkWatcher] --> [GatewayDetect]

note over Frontend, External Services
  Complete monitoring pipeline
end note
@enduml
```
