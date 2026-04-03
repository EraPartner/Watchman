---
title: ADR-008 - Configuration Management via Environment Variables
type: adr
status: accepted
date: 2026-04-02
tags: [adr, backend, configuration, deployment]
description: Environment-driven configuration with startup validation and multi-instance support via numbered env var patterns
aliases: [configuration, environment variables, config management]
---

# ADR-008: Configuration Management via Environment Variables

> [!abstract] Summary
> All configuration comes from environment variables, parsed and validated at startup, with multi-instance support via numbered env var patterns (`SERVICE_N_*`).

## Status

- **Status**: Accepted
- **Date**: 2026-04-02

## Context

Watchman runs as a self-hosted application that needs to connect to various external services. Configuration must be flexible for different deployment environments (Docker, bare metal, development) while ensuring required values are present at startup.

## Decision

Configuration is managed through environment variables:

### Core Configuration (`config.js`)

- `validateEnvironment()` - Fails fast on missing required variables
- `getConfig()` - Returns structured config object
- `parseServiceInstances()` - Discovers multi-instance services from numbered env var patterns (e.g., `QBITTORRENT_1_URL`, `QBITTORRENT_2_URL`)
- `ENABLED_SERVICES` env var allows selective service activation (defaults to all if unset)

### Per-Service Configuration (`serviceFactoryConfig.js`)

- Each service's `getConfig()` function encapsulates its own environment variable parsing and defaults
- Optional services can return `null` from `getConfig()` to skip initialization
- Configuration is parsed once at startup and cached

### Key Code

- `[[apps/backend/config.js]]` - Core configuration management
- `[[apps/backend/services/serviceFactoryConfig.js]]` - Per-service config parsing

## Consequences

### Positive

- Environment variables are the standard for 12-factor apps and containerized deployments
- Validation at startup prevents runtime failures from missing configuration
- Multi-instance support via numbered env var patterns enables horizontal scaling
- Selective service activation via `ENABLED_SERVICES`
- Per-service config encapsulation keeps configuration logic modular

### Negative

- Config is parsed once at startup and cached -- no hot-reloading
- Multi-instance parsing uses regex matching on all env var keys -- potentially slow with very large env
- No configuration file support (YAML/JSON) -- everything must be env vars
- `cachedConfig` export is a snapshot at module load time -- changes to `process.env` after that are not reflected

### Risks

- Large number of environment variables become hard to manage without a config file
- No validation of env var values beyond presence checks (e.g., URL format validation)

## PlantUML Diagrams

### Configuration Architecture

```plantuml
@startuml
!theme plain

package "Environment" as Env {
    [AUTH_USERNAME]
    [AUTH_PASSWORD_HASH]
    [JWT_SECRET]
    [FRONTEND_URL]
    [ENABLED_SERVICES]
    [ADGUARD_HOST]
    [QBITTORRENT_1_*]
    [QBITTORRENT_2_*]
}

package "Config Module" as Config {
    [validateEnvironment]
    [getConfig]
    [parseServiceInstances]
    [cachedConfig]
}

package "Service Factory" as Factory {
    [serviceFactoryConfigs]
    [getConfig() per service]
}

Env --> Config : Process startup
Config -> Config : validateEnvironment()
Config -> Config : getConfig()
Config -> Config : parseServiceInstances()

Config --> Factory : Cached config
Factory --> Factory : Per-service getConfig()

note right of Config
  Result:
  - Required vars validated
  - Multi-instance parsed
  - Services enabled/disabled
  - All cached in memory
end note
@enduml
```

### Multi-Instance Discovery

```plantuml
@startuml
!theme plain

participant "Config" as Cfg
participant "process.env" as Env
participant "parseServiceInstances" as Parser

Cfg -> Parser : parseServiceInstances('qbittorrent')

Parser -> Env : Scan all env vars
Env --> Parser : Return all keys

Parser -> Parser : Match pattern\n/^QBITTORRENT_(\d+)_(.*)$/

alt Found matches
    Parser -> Parser : Group by instance number

    note right of Parser
      QBITTORRENT_1_URL -> instance 1
      QBITTORRENT_1_USERNAME -> instance 1
      QBITTORRENT_2_URL -> instance 2
    end note

    Parser --> Cfg : Array of 2 instances

else No matches
    Parser -> Env : Fall back to\nQBITTORRENT_* (legacy)
    Parser --> Cfg : Array of 1 instance
end
@enduml
```

### Startup Validation Flow

```plantuml
@startuml
!theme plain

participant "Node.js" as Node
participant "config.js" as Config
participant "Environment" as Env

Node -> Config : Import module

note over Config
  Module initialization:
  - validateEnvironment() called
  - getConfig() called
  - Results cached in cachedConfig
end note

Config -> Env : Check AUTH_USERNAME
alt Missing
    Config -> Node : Throw Error: AUTH_USERNAME required
else Present
    Config -> Env : Check AUTH_PASSWORD_HASH
    alt Missing
        Config -> Node : Throw Error
    else Present
        Config -> Env : Check JWT_SECRET
        alt Missing
            Config -> Node : Throw Error
        else Present
            Config -> Env : Check FRONTEND_URL
            alt Missing
                Config -> Node : Throw Error
            else Present
                Config -> Config : All required vars OK
                Config -> Config : Export cachedConfig
            end
        end
    end
end
@enduml
```

### Service Enabling Logic

```plantuml
@startuml
!theme plain

participant "Config" as Cfg
participant "ServiceFactory" as Factory
participant "ServiceManager" as SM

alt ENABLED_SERVICES set
    Cfg -> Cfg : Parse from string\n"SERVICE1,SERVICE2"
    Cfg --> Factory : Limited service set
else ENABLED_SERVICES not set
    Cfg -> Cfg : Use default all services
    Cfg --> Factory : All services
end

Factory --> SM : Initialize only enabled

SM -> SM : For each enabled service\ncall checkConfig()

alt Service Config Valid
    SM -> SM : Service enabled = true
else Service Config Missing
    SM -> SM : Service enabled = false
    note right of SM
      Service won't respond
      but won't crash
    end note
end
@enduml
```

## References

- [[docs/reference/environment-variables|Environment Variables]]
- [[docs/features/multi-instance|Multi-Instance Support]]
- Related code: `[[apps/backend/config.js]]`
- Related code: `[[apps/backend/services/serviceFactoryConfig.js]]`
