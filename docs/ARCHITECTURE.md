# Watchman Architecture

## Overview

Watchman is a full-stack monitoring dashboard for self-hosted services. It consists of a React TypeScript frontend,
Node.js Express backend, and integrates with multiple external services.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vite + React)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Dashboard  │  │    Cards     │  │   Auth UI    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Node.js/Express)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Auth Layer   │  │  Middleware  │  │   API Routes │     │
│  │ - JWT        │  │  - CSRF      │  │  - /health   │     │
│  │ - Rate Limit │  │  - Logging   │  │  - /api/*    │     │
│  │ - IP Control │  │  - Cache     │  │  - /api/docs │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Service Manager                        │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │   │
│  │  │AdGuard │ │Bitcoin │ │  Tor   │ │ IPFS   │ ... │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   AdGuard    │ │   Bitcoin    │ │     Tor      │
    │     Home     │ │     Node     │ │    Relay     │
    └──────────────┘ └──────────────┘ └──────────────┘
```

## Technology Stack

### Frontend

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS + shadcn/ui components
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router v6
- **HTTP Client**: Axios (auto-generated from OpenAPI)

### Backend

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Authentication**: JWT + bcrypt
- **Security**: Helmet, CORS, CSRF protection
- **Logging**: Structured logging with PII redaction
- **API Docs**: OpenAPI 3.0 + Swagger UI
- **Caching**: node-cache (in-memory)
- **Rate Limiting**: express-rate-limit

## Component Architecture

### Frontend Components

```
src/
├── components/          # React components
│   ├── *Card.tsx       # Service-specific cards
│   ├── AuthGuard.tsx   # Auth protection wrapper
│   └── ErrorBoundary.tsx
├── hooks/              # Custom React hooks
│   └── useAuth.ts
├── pages/              # Page components
├── services/           # API client services
│   └── api.ts         # Auto-generated from OpenAPI
├── types/              # TypeScript types
└── utils/              # Utility functions
```

### Backend Services

```
backend/
├── server.js           # Express app & routes
├── config.js           # Configuration management
├── middleware/         # Express middleware
│   ├── auth.js        # JWT authentication
│   ├── rateLimiting.js
│   ├── csrf.js
│   ├── cache.js
│   ├── logger.js      # Structured logging
│   ├── ipControl.js   # IP whitelist/blacklist
│   └── securityMonitor.js
├── services/           # Service integrations
│   ├── ServiceManager.js     # Central service orchestrator
│   ├── AdGuardService.js
│   ├── BitcoinService.js
│   ├── TorService.js
│   └── ...
└── openapi.yaml       # API specification
```

## Data Flow

### Authentication Flow

1. User submits credentials to `/api/auth/login`
2. Backend validates credentials (bcrypt)
3. JWT token generated and set as HTTP-only cookie
4. CSRF token issued for form submissions
5. Frontend stores auth state
6. Subsequent requests include JWT in cookie
7. Middleware validates JWT on protected routes

### Service Monitoring Flow

1. Frontend requests service status (e.g., `/api/adguard/status`)
2. Rate limiting middleware checks request quota
3. Cache middleware checks for cached response
4. ServiceManager retrieves service instance
5. Service makes HTTP/SSH call to external service
6. Response normalized and cached
7. JSON response sent to frontend
8. Frontend updates UI with service status

### Real-time Updates

1. WebSocket connection established on frontend load
2. Backend ServiceManager polls services on interval
3. Status changes broadcast via WebSocket
4. Frontend receives updates and updates UI
5. No polling needed from frontend

## Security Architecture

### Defense Layers

1. **Network Layer**

    - HTTPS enforcement in production
    - IP whitelist/blacklist
    - CORS restrictions

2. **Application Layer**

    - JWT authentication
    - CSRF protection
    - Rate limiting (tiered)
    - Input validation/sanitization
    - Command injection prevention

3. **Data Layer**

    - bcrypt password hashing
    - Secure environment variables
    - PII redaction in logs
    - No sensitive data in frontend

4. **Monitoring Layer**
    - Structured logging
    - Audit trails
    - Security alerts
    - Failed login tracking
    - Account lockout

## Service Integration Pattern

Each service follows this pattern:

```javascript
class ServiceName {
  constructor(config) {
    this.name = 'service-name';
    this.config = config;
    this.enabled = this.checkConfig();
  }

  // Check if service is properly configured
  checkConfig() {
    return !!(this.config.host && this.config.auth);
  }

  // Health check - is service responsive?
  async getHealth() {
    if (!this.enabled) return { status: 'offline' };
    try {
      // Ping service endpoint
      return { status: 'online', timestamp: new Date() };
    } catch (error) {
      return { status: 'offline', error: error.message };
    }
  }

  // Get detailed statistics
  async getStats() {
    if (!this.enabled) return null;
    // Fetch and normalize service-specific data
    return { data: {...}, timestamp: new Date() };
  }

  // Control actions (optional)
  async performAction(action, params) {
    // Execute service-specific action
  }
}
```

## Deployment Architecture

### Development

- Frontend: `npm run dev` (Vite dev server on 5173)
- Backend: `npm start` (Express on 3001)
- Separate processes, CORS enabled

### Production

- Frontend: Static build served by CDN/Nginx
- Backend: PM2/systemd managed Node process
- Reverse proxy (Nginx) handles HTTPS/routing
- Environment-specific configurations

## Performance Considerations

### Caching Strategy

- **Health checks**: 30s TTL
- **Statistics**: 60s TTL
- **Configuration**: No cache (real-time)
- Cache invalidation on control actions

### Rate Limiting Tiers

- **Health endpoints**: 100 req/15min per IP
- **Auth endpoints**: 5 req/15min per IP
- **Control endpoints**: 20 req/15min per IP
- **General API**: 100 req/15min per IP

### Optimization Techniques

- Lazy loading of service cards
- Request batching where possible
- WebSocket for real-time updates (no polling)
- Compression middleware (gzip)
- Connection pooling for external services

## Scalability

### Horizontal Scaling

- Backend is stateless (JWT in cookies)
- Shared session store needed for multi-instance
- Load balancer with sticky sessions
- Redis for shared cache (optional)

### Vertical Scaling

- Single instance handles 100+ concurrent users
- CPU-bound: service polling operations
- Memory-bound: cache size, WebSocket connections
- I/O-bound: external service calls

## Extensibility

### Adding New Services

1. Create service class in `backend/services/`
2. Implement required methods (getHealth, getStats)
3. Register in ServiceManager
4. Add environment variables to config
5. Create frontend Card component
6. Add to dashboard grid
7. Update OpenAPI spec

### Adding New Endpoints

1. Add route in `backend/server.js`
2. Implement middleware chain
3. Update `backend/openapi.yaml`
4. Regenerate frontend client: `npm run generate-api`
5. Create React hook for endpoint
6. Update UI components

## Monitoring & Observability

### Logging

- Structured JSON logs
- Request ID tracking
- Error stack traces
- Performance metrics
- Audit trail for sensitive operations

### Metrics

- Request/response times
- Success/error rates
- Service availability
- Cache hit ratios
- WebSocket connections

### Health Checks

- Backend: `/health` endpoint
- Services: Individual `/api/{service}/health`
- Overall: `/api/services/health`

## Security Best Practices

See [SECURITY.md](./SECURITY.md) for detailed security documentation.

## API Documentation

See [API-DOCUMENTATION.md](./API-DOCUMENTATION.md) for API usage and OpenAPI spec details.
