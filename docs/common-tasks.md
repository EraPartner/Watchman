---
title: Common Tasks
type: reference
status: active
date: 2026-04-02
tags: [reference, tasks, quick-reference]
description: Task-oriented quick reference for common Watchman development operations
aliases: [common tasks, quick reference, cheat sheet]
---

# Common Tasks

> [!abstract] Purpose
> Quick reference for frequently performed tasks in the Watchman project.

## Development

### Start Development

```bash
npm install && npm run dev
```

### Check Backend Health

```bash
curl http://localhost:3001/health
```

### View API Documentation

Open `http://localhost:3001/api/docs`

### Generate Password Hash

```bash
node -e "console.log(require('bcrypt').hashSync('yourpassword', 10))"
```

## Adding a Service

1. Create service class in `apps/backend/services/`
2. Register in `serviceFactoryConfig.js`
3. Add env vars to `.env.example`
4. Add route in `server.js`
5. Create frontend card component
6. Update OpenAPI spec
7. Create integration doc

See [[docs/guides/adding-services|Adding Services Guide]] for details.

## Configuration

### Enable Specific Services

```bash
ENABLED_SERVICES=adguard,tor,bitcoin
```

### Add Multi-Instance Service

```bash
QBITTORRENT_1_URL=http://192.0.2.10:8080
QBITTORRENT_2_URL=http://192.0.2.11:8080
```

### Clear Backend Cache

```bash
curl -X POST http://localhost:3001/api/cache/clear \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### Backend Won't Start

- Check required env vars: `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `JWT_SECRET`, `FRONTEND_URL`
- Check port availability: `lsof -i :3001`

### Frontend Can't Connect

- Verify `FRONTEND_URL` matches frontend origin
- Check CORS configuration
- Verify backend is running on port 3001

### Service Shows Offline

- Check service env vars are set
- Verify service is in `ENABLED_SERVICES`
- Check network connectivity to service host

## Related

- [[docs/guides/setup|Setup Guide]]
- [[docs/troubleshooting.md|Troubleshooting]]
- [[docs/reference/environment-variables|Environment Variables]]

## PlantUML Diagrams

### Development Workflow

```plantuml
@startuml
!theme plain

actor "Developer" as Dev

box "Development"
    participant "Terminal" as Term
    participant "Backend" as BE
    participant "Frontend" as FE
end box

Dev -> Term : npm run dev

par
    Term -> BE : npm run dev:backend\n(Express on :3001)
    Term -> FE : npm run dev:frontend\n(Vite on :5173)
end

BE --> BE : Server running
FE --> FE : Dev server ready

Dev -> Term : curl http://localhost:3001/health
Term -> BE : Health check
BE --> Term : {status: ok}

Dev -> Term : Open http://localhost:5173
Term -> FE : Browser loads
FE --> Term : Dashboard UI
@enduml
```

### Environment Configuration

```plantuml
@startuml
!theme plain

database "Environment Variables" as Env

package "Required" as Req {
    [AUTH_USERNAME]
    [AUTH_PASSWORD_HASH]
    [JWT_SECRET]
    [FRONTEND_URL]
}

package "Service Config" as Svc {
    [ADGUARD_HOST]
    [BITCOIN_RPC_*]
    [TOR_*]
    [QBITTORRENT_*]
}

package "Optional" as Opt {
    [ENABLED_SERVICES]
    [LOG_LEVEL]
    [NODE_ENV]
}

Env --> Req : Must be set
Env --> Svc : Service-specific
Env --> Opt : Fine-tuning
@enduml
```

### Service Lifecycle

```plantuml
@startuml
!theme plain

participant "Backend" as BE
participant "Config" as Cfg
participant "ServiceFactory" as Factory
participant "ServiceManager" as SM

BE -> Cfg : Initialize config
Cfg -> Cfg : Validate environment

BE -> Factory : Create services

loop For each service
    Factory -> Factory : getConfig()
    alt Config valid
        Factory --> SM : Create service instance
    else Config missing
        Factory --> SM : Skip service
    end
end

SM -> SM : Initialize health polling\n(every 15s)

note over SM
  Services ready
  for requests
end note
@enduml
```
