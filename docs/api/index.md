---
title: API Documentation
type: index
status: active
date: 2026-04-18
tags: [api, index, backend, openapi, endpoint, rest, fastify]
description: Complete API endpoint documentation for Watchman - REST API with OpenAPI 3.1 specification (regenerated from TypeScript backend)
aliases: [api index, endpoints, rest api, swagger, openapi spec]
---

# API Documentation

> [!abstract] Overview
> Watchman provides a RESTful API with a TypeScript + Fastify 4 backend. The OpenAPI 3.1 specification is complete and reflects all current endpoints.
>
> **Base URL**: `http://localhost:3001` (development)
>
> **API Version**: 2.0.0  
> **License**: AGPL-3.0-only

## Response Envelope

All API responses use a consistent envelope format:

**Success Response:**
```json
{
  "data": { /* response payload */ }
}
```

**Error Response:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Error Codes

| Code          | HTTP Status | Meaning                                      |
| ------------- | ----------- | -------------------------------------------- |
| `NOT_FOUND`   | 404         | Service instance or resource not found       |
| `UNAVAILABLE` | 503         | Service is unreachable or unhealthy          |
| `UNAUTHORIZED`| 401         | Missing or invalid authentication            |
| `TIMEOUT`     | 408         | Request timeout while polling service        |
| `CIRCUIT_OPEN`| 503         | Circuit breaker is open for the service      |
| `VALIDATION`  | 400         | Invalid request parameters or body           |

## Endpoint Categories

### Meta Endpoints

Operational health and version information.

| Endpoint            | Method | Description               |
| ------------------- | ------ | ------------------------- |
| `GET /meta/health`  | GET    | Liveness probe            |
| `GET /meta/version` | GET    | API version and Node info |

**Response Example** (`/meta/health`):
```json
{
  "ok": true,
  "service": "watchman-backend-v2",
  "uptime": 3600,
  "timestamp": "2026-04-18T12:00:00Z"
}
```

### Services Endpoints

Service health, stats, and control.

| Endpoint                       | Method | Description                           | Query Parameters         |
| ------------------------------ | ------ | ------------------------------------- | ------------------------ |
| `GET /services`                | GET    | Aggregated health for all services    | -                        |
| `GET /services/{kind}/health`  | GET    | Health for specific service instance  | `instance` (optional)    |
| `GET /services/{kind}/stats`   | GET    | Stats for specific service instance   | `instance` (optional)    |
| `POST /services/{kind}/control`| POST   | Issue control action to service       | `instance` (optional)    |

**Path Parameters:**
- `{kind}`: Service kind (e.g., `bitcoin`, `ipfs`, `homebridge`, etc.)

**Query Parameters:**
- `instance`: Instance ID. Omit to use first registered instance for the kind.

**Health Response**:
```json
{
  "data": {
    "reachable": true,
    "latencyMs": 45,
    "message": "OK",
    "details": { /* service-specific details */ },
    "at": 1713446400000
  }
}
```

**Stats Response**:
```json
{
  "data": {
    "metrics": {
      "key1": 123,
      "key2": "value",
      "key3": true
    },
    "at": 1713446400000
  }
}
```

**Control Request Body** (`/services/{kind}/control`):
```json
{
  "action": "restart"
}
```

### Instances Endpoints

Service instance discovery and metadata.

| Endpoint              | Method | Description                      |
| --------------------- | ------ | -------------------------------- |
| `GET /instances`      | GET    | All registered service instances |
| `GET /instances/{kind}`| GET    | Instances for a given service    |
| `GET /kinds`          | GET    | All registered service kinds     |

**Instance Response**:
```json
{
  "data": [
    {
      "id": "bitcoin:main",
      "kind": "bitcoin",
      "instanceId": "main"
    }
  ]
}
```

### Metrics Endpoints

Operational metrics (circuit breakers, background poller, cache, process).

| Endpoint       | Method | Description                    |
| -------------- | ------ | ------------------------------ |
| `GET /metrics` | GET    | Operational metrics snapshot   |

**Metrics Response**:
```json
{
  "breakers": {
    "bitcoin_main": {
      "state": "CLOSED",
      "successes": 150,
      "failures": 2,
      "rejects": 0,
      "trips": 0
    }
  },
  "poller": {
    "polledAt": 1713446400000,
    "nextPollAt": 1713446460000,
    "totalPolls": 500,
    "pollDuration": 45
  },
  "cache": {
    "hits": 1200,
    "misses": 50,
    "size": 2048,
    "maxSize": 10240
  },
  "process": {
    "uptime": 3600,
    "memory": {
      "heapUsed": 52428800,
      "heapTotal": 104857600
    },
    "cpu": { /* CPU usage */ }
  }
}
```

## OpenAPI Specification

The complete API specification is defined in OpenAPI 3.1 format:

| Resource       | Location                         | Details                  |
| -------------- | -------------------------------- | ------------------------ |
| **Spec File**  | [[apps/backend/openapi.yaml]]    | OpenAPI 3.1 spec, v2.0.0 |
| **Format**     | JSON/YAML                        | Machine-readable API contract |
| **License**    | AGPL-3.0-only                    | Same as backend          |

The specification is the canonical source for all endpoint definitions, request/response schemas, and error codes. All endpoints listed in the Endpoint Categories section above are reflected in the spec.

### Schema Definitions

Key schemas defined in the OpenAPI spec:

- **HealthSnapshot** - Service reachability, latency, details, and timestamp
- **StatsSnapshot** - Service metrics dictionary and timestamp
- **AggregatedEntry** - Service result (success or error) with health snapshot
- **InstanceInfo** - Service instance metadata (id, kind, instanceId)
- **MetricsSnapshot** - Operational metrics (breakers, poller, cache, process)
- **BreakerMetrics** - Circuit breaker state and counters
- **CacheStats** - Cache hit/miss counts and size
- **PollerStats** - Poll timing and frequency statistics
- **DomainError** - Standard error envelope (code, message)

See [[apps/backend/openapi.yaml]] for complete definitions with examples.

## Related Documentation

- [[docs/integrations/index|Service Integrations]]
- [[docs/reference/error-codes|Error Codes Reference]]
- [[docs/security/authentication|Authentication]]
- [[docs/security/rate-limiting|Rate Limiting]]
- [[apps/backend/openapi.yaml|OpenAPI Spec (Code)]]
