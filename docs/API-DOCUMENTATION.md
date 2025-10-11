# Watchman API Documentation

## Overview

The Watchman Backend API provides comprehensive monitoring and management capabilities for various services including
AdGuard, Bitcoin, qBittorrent, IPFS, Tor, Synology NAS, Homebridge, Alby Hub, and more.

## OpenAPI Specification

The API is fully documented using OpenAPI 3.0 specification. You can access:

- **Interactive API Documentation (Swagger UI)**: `http://localhost:3001/api/docs`
- **OpenAPI Spec File**: `backend/openapi.yaml` or `backend/api-docs.yaml`

## Key Features

### 📖 Interactive Documentation

Visit `/api/docs` to explore all endpoints with:

- Request/response schemas
- Authentication requirements
- Try-it-out functionality
- Example requests and responses

### 🔐 Authentication

Most endpoints require JWT authentication via:

- Bearer token in Authorization header
- HTTP-only cookie (automatically set on login)

### 🏷️ API Categories

- **Health** - System health checks
- **Authentication** - Login, logout, session management
- **Cache** - Cache management operations
- **AdGuard** - AdGuard DNS monitoring and control
- **Bitcoin** - Bitcoin node monitoring
- **qBittorrent** - Torrent client monitoring
- **IPFS** - IPFS node monitoring
- **Tor** - Tor relay monitoring
- **Roon** - Roon music server monitoring
- **Synology** - Synology NAS monitoring
- **Philips** - Philips Hue Bridge monitoring
- **Homebridge** - Homebridge smart home monitoring
- **Alby Hub** - Alby Hub Lightning wallet monitoring
- **Mac Mini** - Mac Mini server monitoring
- **Services** - Multi-service operations
- **Router** - Router and network operations
- **Security** - Security monitoring and IP control
- **Config** - Configuration endpoints

## Example Usage

### Get Service Health

```bash
curl http://localhost:3001/api/services/health
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'
```

### Get Bitcoin Stats (with auth)

```bash
curl http://localhost:3001/api/bitcoin/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Client Code Generation

You can generate client libraries from the OpenAPI spec using tools like:

- **openapi-generator** - Supports 50+ languages
- **swagger-codegen** - Multi-language support
- **oazapfts** - TypeScript client generator

Example:

```bash
# Generate TypeScript client
npx openapi-generator-cli generate \
  -i backend/openapi.yaml \
  -g typescript-axios \
  -o gen/
```

## Benefits of OpenAPI Integration

1. **Automatic Documentation** - Always up-to-date API docs
2. **Type Safety** - Generate type-safe clients for your frontend
3. **Validation** - Request/response validation against schemas
4. **Testing** - Easy API testing with Swagger UI
5. **Standards Compliance** - Industry-standard API specification
6. **Client Generation** - Auto-generate API clients in any language

## Development

The OpenAPI spec is located at:

- `backend/openapi.yaml` (main spec)
- `backend/api-docs.yaml` (symlink)

When you add new endpoints to `server.js`, update the OpenAPI spec to keep documentation in sync.

## Tools & Libraries Used

- **swagger-ui-express** - Serves interactive API documentation
- **yamljs** - Parses YAML OpenAPI spec
- **OpenAPI 3.0** - API specification standard
