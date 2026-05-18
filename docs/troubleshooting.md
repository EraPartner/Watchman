---
title: Troubleshooting
type: reference
status: active
date: 2026-05-16
tags: [reference, troubleshooting, debugging, openapi, typescript-generation, single-user]
description: Common issues and solutions for the Watchman project
aliases: [troubleshooting, issues, problems, debugging, faq]
---

# Troubleshooting

> [!abstract] Purpose
> Common issues and their solutions for Watchman development and deployment.

## Backend Issues

### Server Won't Start

**Symptom**: Process exits immediately with error.

**Solutions**:

- Check required environment variables are set: `FRONTEND_URL`
- Check port 3001 is not in use: `lsof -i :3001`
- Review logs in `apps/backend/logs/`
- Verify Node.js version is 18+: `node --version`

### Service Shows Offline

**Symptom**: Service card displays "offline" status.

**Solutions**:

- Verify service is in `ENABLED_SERVICES` (or not excluded)
- Check service-specific env vars are set correctly
- Verify network connectivity to service host
- Check service is running and accessible
- Review backend logs for connection errors

### CORS Misconfiguration

**Symptom**: Frontend requests succeed in development but fail in production.

**Solutions**:

- Verify `FRONTEND_URL` is set correctly and matches browser origin exactly
- Check for trailing slashes or protocol mismatches
- Watchman is single-user with no authentication; security relies on network isolation (see [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]])


## Frontend Issues

### Dashboard Doesn't Load

**Symptom**: Blank page or loading spinner.

**Solutions**:

- Check browser console for errors
- Verify backend is running on port 3001
- Check network tab for failed API requests
- Verify WebSocket connection is established

### Service Cards Not Rendering

**Symptom**: Some service cards missing from dashboard.

**Solutions**:

- Check `ENABLED_SERVICES` configuration
- Verify service env vars are set
- Check frontend config endpoint: `GET /api/config/frontend`

## Deployment Issues

### Production Startup Fails

**Symptom**: Server exits in production mode.

**Solutions**:

- Verify `NODE_ENV=production`
- Ensure `FRONTEND_URL` matches the actual deployment origin
- Check all required env vars are set (see `.env.example`)
- Verify data directory is writable: `ls -la ./data`

### WebSocket Connection Fails

**Symptom**: Real-time updates not working.

**Solutions**:

- Verify Nginx proxy passes WebSocket upgrade headers
- Check Nginx config has `proxy_set_header Upgrade $http_upgrade`
- Verify no firewall blocking WebSocket connections

## Development Workflow Issues

### `npm run generate:types` Fails

**Symptom**: `openapi-typescript apps/backend/openapi.yaml` command fails with `$ref` resolution errors.

**Cause**: The `openapi.yaml` spec contains unresolvable `$ref` pointers, most commonly in Philips Bridge pairing endpoints.

**Solution**:

- Fix referenced schema definitions in `apps/backend/openapi.yaml` to ensure all `$ref` paths point to valid `#/components/schemas/` definitions
- Verify no circular or external references that the generator cannot resolve
- Once fixed, `npm run generate:types` will generate `apps/frontend/src/types/generated.ts` for frontend TypeScript sync

**Future CI**:

A Vision-style `verify-generated` CI job will be added once the spec is fixed, to ensure generated types remain in sync with the spec on every commit.

## Performance Issues

### Slow Response Times

**Solutions**:

- Check external service response times
- Verify caching is working (30s health, 60s stats TTL)
- Check circuit breaker isn't causing delays
- Review performance monitor logs

### High Memory Usage

**Solutions**:

- Check cache size (in-memory, unbounded)
- Monitor WebSocket connection count
- Consider Redis for shared caching in multi-instance

## Related

- [[docs/common-tasks.md|Common Tasks]]
- [[docs/guides/setup|Setup Guide]]
- [[docs/guides/deployment|Deployment Guide]]

## PlantUML Diagrams

### Debug Flowchart

```plantuml
@startuml
!theme plain

start

:Encounter Issue;

if (Server Won't Start?) then (yes)
    :Check required env vars\nFRONTEND_URL, NODE_ENV;
    :Check port 3001 availability;
    :Check data directory writable;
    :Review backend logs;
else (no)
endif

if (Service Shows Offline?) then (yes)
    :Verify ENABLED_SERVICES;
    :Check service env vars;
    :Verify network connectivity;
    :Check service is running;
else (no)
endif

if (WebSocket Fails?) then (yes)
    :Verify /ws endpoint is accessible;
    :Check proxy passes Upgrade headers;
else (no)
endif

stop
@enduml
```

### Request Flow for Debugging

```plantuml
@startuml
!theme plain

participant "Frontend" as FE
participant "Backend" as BE
participant "Middleware" as MW
participant "ServiceManager" as SM
participant "CircuitBreaker" as CB
participant "External Service" as Ext

FE -> BE : GET /api/{service}/status

BE -> MW : Apply middleware\n(CORS, timeout, compression)

alt Cache Hit
    MW --> BE : Return cached
    BE --> FE : Response
else Cache Miss
    BE -> SM : getServiceHealth()
    SM -> CB : Check circuit

    alt Circuit Closed
        CB -> Ext : HTTP/SSH request
        Ext --> CB : Response
        CB --> SM : Result
        SM --> BE : Response
        BE --> FE : Response
    else Circuit Open
        CB --> SM : Error
        SM --> BE : 503
        BE --> FE : 503 Service Unavailable
    end
end
@enduml
```
