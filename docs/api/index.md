---
title: API Documentation
type: index
status: active
date: 2026-04-10
tags: [api, index, backend, openapi, endpoint, rest]
description: Complete API endpoint documentation for Watchman - REST API with OpenAPI 3.0 specification
aliases: [api index, endpoints, rest api, swagger, openapi spec]
---

# API Documentation

> [!abstract] Overview
> Watchman provides a RESTful API documented with **OpenAPI 3.0**. Interactive documentation is available at `/api/docs` (Swagger UI) when the backend is running.
>
> **Base URL**: `http://localhost:3001` (development)

## Authentication

Most endpoints require JWT authentication. Two methods are supported:

| Method               | How to Use                                                        |
| -------------------- | ----------------------------------------------------------------- |
| **HTTP-Only Cookie** | Cookie is automatically set on login. Send requests from browser. |
| **Bearer Token**     | Include `Authorization: Bearer <token>` header in API requests.   |

**Public Endpoints** (no auth required):

- `GET /health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/config/frontend`

**Protected Endpoints**: Require valid JWT token. See [[docs/security/authentication|Authentication]] for details.

## API Categories

### Core Endpoints

| Endpoint                   | Method | Description            | Auth Required | Rate Limit |
| -------------------------- | ------ | ---------------------- | ------------- | ---------- |
| `GET /health`              | GET    | Backend health check   | No            | 100/15min  |
| `POST /api/auth/login`     | POST   | Authenticate user      | No            | 5/15min    |
| `POST /api/auth/logout`    | POST   | End session            | Yes           | 5/15min    |
| `GET /api/auth/me`         | GET    | Check auth status      | No            | 5/15min    |
| `POST /api/cache/clear`    | POST   | Clear response cache   | Yes + CSRF    | 10/15min   |
| `GET /api/config/frontend` | GET    | Frontend configuration | No            | 100/15min  |

### Service Health Endpoints

| Endpoint                          | Method | Description                 | Auth Required |
| --------------------------------- | ------ | --------------------------- | ------------- |
| `GET /api/services/health`        | GET    | All enabled services health | Yes           |
| `POST /api/services/health-batch` | POST   | Batch health check          | Yes           |
| `GET /api/services/instances`     | GET    | Service instance metadata   | Yes           |

### Per-Service Endpoints

Each service follows the standard pattern `{service}/status` and `{service}/stats`:

```bash
# Status (lightweight health check)
GET /api/{service}/status

# Stats (detailed metrics)
GET /api/{service}/stats
```

#### Service Endpoint Matrix

| Service         | Status Endpoint               | Stats Endpoint               | Special Endpoints                                                                                                                 | Multi-Instance |
| --------------- | ----------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **adguard**     | `GET /api/adguard/status`     | `GET /api/adguard/stats`     | `POST /api/adguard/protection`, `GET /api/adguard/updates`                                                                        | No             |
| **bitcoin**     | `GET /api/bitcoin/status`     | `GET /api/bitcoin/stats`     | `GET /api/bitcoin/health`, `GET /api/bitcoin/updates`                                                                             | No             |
| **tor**         | `GET /api/tor/status`         | `GET /api/tor/stats`         | `GET /api/tor/health`, `GET /api/tor/relay/:nickname`, `GET /api/tor/updates`                                                     | No             |
| **qbittorrent** | `GET /api/qbittorrent/status` | `GET /api/qbittorrent/stats` | -                                                                                                                                 | **Yes**        |
| **ipfs**        | `GET /api/ipfs/status`        | `GET /api/ipfs/stats`        | `GET /api/ipfs/updates`                                                                                                           | No             |
| **synology**    | `GET /api/synology/status`    | `GET /api/synology/stats`    | -                                                                                                                                 | **Yes**        |
| **roon**        | `GET /api/roon/status`        | `GET /api/roon/stats`        | -                                                                                                                                 | **Yes**        |
| **philips**     | `GET /api/philips/status`     | `GET /api/philips/stats`     | -                                                                                                                                 | **Yes**        |
| **homebridge**  | `GET /api/homebridge/status`  | `GET /api/homebridge/stats`  | `GET /api/status/homebridge-version`, `GET /api/status/server-information`, `GET /api/accessories`, `GET /api/homebridge/updates` | No             |
| **macmini**     | `GET /api/macmini/status`     | `GET /api/macmini/stats`     | -                                                                                                                                 | **Yes**        |
| **albyhub**     | `GET /api/albyhub/status`     | `GET /api/albyhub/stats`     | -                                                                                                                                 | **Yes**        |
| **raspi**       | `GET /api/raspi/status`       | `GET /api/raspi/stats`       | -                                                                                                                                 | **Yes**        |

### Router Endpoints

| Endpoint                                     | Method | Description         | Auth Required | CSRF |
| -------------------------------------------- | ------ | ------------------- | ------------- | ---- |
| `GET /api/router/arp?service=beryl\|telenet` | GET    | ARP/neighbor lookup | Yes           | Yes  |

### Security Endpoints

| Endpoint                   | Method | Description         | Auth Required | IP Control |
| -------------------------- | ------ | ------------------- | ------------- | ---------- |
| `GET /api/security/alerts` | GET    | Security alerts     | Yes           | Whitelist  |
| `GET /api/security/stats`  | GET    | Security statistics | Yes           | Whitelist  |

## Multi-Instance Pattern

Services supporting multiple instances use the pattern:

```
/api/{serviceType}_{instanceNum}/status
/api/{serviceType}_{instanceNum}/stats
```

**Example**: qBittorrent with 2 instances:

```bash
GET /api/qbittorrent_1/status
GET /api/qbittorrent_1/stats
GET /api/qbittorrent_2/status
GET /api/qbittorrent_2/stats
```

## Request/Response Examples

### Health Check Response

```json
{
  "success": true,
  "data": {
    "status": "online",
    "timestamp": "2026-04-02T12:00:00.000Z",
    "service": "adguard",
    "data": {
      "protectionEnabled": true,
      "version": "v0.107.8"
    }
  }
}
```

### Stats Response

```json
{
  "success": true,
  "data": {
    "timestamp": "2026-04-02T12:00:00.000Z",
    "service": "adguard",
    "data": {
      "queriesTotal": 1250000,
      "queriesBlocked": 345000,
      "blockedPercentage": 27.6,
      "filters": [
        { "id": 1, "enabled": true, "rulesCount": 45000 },
        { "id": 2, "enabled": true, "rulesCount": 23000 }
      ]
    }
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_OFFLINE",
    "message": "Service is not available",
    "statusCode": 503
  }
}
```

## Response Format

All responses follow a standardized format via [[apps/backend/middleware/apiResponse.js|apiResponse middleware]]:

| Field     | Type    | Description                   |
| --------- | ------- | ----------------------------- |
| `success` | boolean | Whether the request succeeded |
| `data`    | object  | Response data (if success)    |
| `error`   | object  | Error details (if failure)    |

### Error Response Structure

| Field        | Type   | Description                                    |
| ------------ | ------ | ---------------------------------------------- |
| `code`       | string | Error code (e.g., `UNAUTHORIZED`, `NOT_FOUND`) |
| `message`    | string | Human-readable error message                   |
| `statusCode` | number | HTTP status code                               |

See [[docs/reference/error-codes|Error Codes Reference]] for all error codes.

## OpenAPI Specification

The complete API specification is available in OpenAPI 3.0 format:

| Resource       | Location                         |
| -------------- | -------------------------------- |
| **Spec File**  | [[apps/backend/openapi.yaml]]    |
| **Symlink**    | [[apps/backend/api-docs.yaml]]   |
| **Swagger UI** | `http://localhost:3001/api/docs` |

### Adding New Endpoints

When adding a new API endpoint:

1. Add route in `apps/backend/server.js` or `apps/backend/routes/`
   - Prefer dedicated registration modules under `apps/backend/routes/` for non-factory routes, wired through `[[apps/backend/routes/registerApiRoutes.js]]` and `[[apps/backend/bootstrap/registerRoutes.js]]`
2. Apply appropriate middleware (auth, CSRF, rate limiting)
3. Update [[apps/backend/openapi.yaml|OpenAPI spec]] with endpoint definition
4. Create endpoint documentation in `docs/api/`
5. Update this index with the new endpoint

## Rate Limits

| Tier    | Limit         | Endpoints                                                           |
| ------- | ------------- | ------------------------------------------------------------------- |
| Health  | 100 req/15min | `/health`, service status endpoints                                 |
| Auth    | 5 req/15min   | Login, logout, auth status                                          |
| Control | 20 req/15min  | Sensitive write routes (protection toggle, cache clear, router ARP) |
| General | 100 req/15min | Most API endpoints                                                  |

See [[docs/security/rate-limiting|Rate Limiting]] for details.

## Related Documentation

- [[docs/integrations/index|Service Integrations]]
- [[docs/reference/error-codes|Error Codes Reference]]
- [[docs/security/authentication|Authentication]]
- [[docs/security/rate-limiting|Rate Limiting]]
- [[apps/backend/openapi.yaml|OpenAPI Spec (Code)]]
