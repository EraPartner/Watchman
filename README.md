# Watchman

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs&logoColor=white)
![Monorepo](https://img.shields.io/badge/monorepo-npm%20workspaces-CB3837?logo=npm&logoColor=white)
![API](https://img.shields.io/badge/API-OpenAPI%203.0-6BA539)
[![GitHub Issues](https://img.shields.io/github/issues/EraPartner/Watchman)](https://github.com/EraPartner/Watchman/issues)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/EraPartner/Watchman)](https://github.com/EraPartner/Watchman/commits/main)
[![GitHub Stars](https://img.shields.io/github/stars/EraPartner/Watchman?style=social)](https://github.com/EraPartner/Watchman/stargazers)

Watchman is a full-stack dashboard for **monitoring self-hosted services** from one place.
It combines a React + TypeScript frontend with a Node.js + Express backend and supports real-time status visibility across your stack.

> [!IMPORTANT]
> **Monitoring-only by design**
>
> Watchman is intentionally **read-only**. It does **not** start/stop/restart/reconfigure services.

## Why Watchman?

If you run multiple services, Watchman gives you one dashboard instead of 10+ browser tabs.

| You need...                                 | Watchman gives you...                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Fast visibility across services             | Unified health + stats endpoints and cards in a single UI                                |
| Support for multiple instances of a service | Numbered env-based multi-instance support (e.g. multiple qBittorrent/Synology instances) |
| Live status updates                         | WebSocket-based real-time updates                                                        |
| Secure defaults                             | JWT auth (HTTP-only cookies), CSRF protection, rate limiting, security headers           |
| Extensibility                               | Factory-driven service integration architecture                                          |

## Feature Highlights

- ✅ Unified dashboard for self-hosted service health and statistics
- ✅ Monitoring-only architecture (no service control plane)
- ✅ Multi-instance support for selected integrations
- ✅ Real-time updates via WebSockets
- ✅ OpenAPI/Swagger API docs (`/api/docs`)
- ✅ Circuit breaker + caching patterns for resilient service polling
- ✅ Security-focused middleware stack (JWT, CSRF, rate limits, IP control)

## Supported Integrations (Examples)

Watchman supports **14+ service types**. You can enable only what you use.

| Category           | Integrations                               |
| ------------------ | ------------------------------------------ |
| Network & Security | AdGuard Home, Tor, Router (Beryl, Telenet) |
| Cryptocurrency     | Bitcoin, Alby Hub                          |
| Storage & Sharing  | qBittorrent, IPFS, Synology                |
| Smart Home & Media | Homebridge, Philips Hue, Roon              |
| Infrastructure     | Mac Mini, Raspberry Pi                     |
| Social             | Nostrcheck                                 |

See full docs: [`docs/integrations/index.md`](./docs/integrations/index.md)

## Architecture at a Glance

| Layer    | Stack                                                    | Responsibility                                   |
| -------- | -------------------------------------------------------- | ------------------------------------------------ |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query | Dashboard UI, auth/session state, live updates   |
| Backend  | Node.js, Express, WebSocket (`ws`), OpenAPI              | Service polling, API endpoints, auth, security   |
| Monorepo | npm workspaces                                           | Shared development workflow for frontend/backend |

## Quick Start (Local Development)

### 1) Prerequisites

- Node.js **18+**
- npm
- Git

### 2) Clone and install

```bash
git clone https://github.com/EraPartner/Watchman.git
cd Watchman
npm install
```

### 3) Configure backend environment

```bash
cp apps/backend/.env.example apps/backend/.env.local
```

Required values in `apps/backend/.env.local`:

| Variable             | Why it is required                                     |
| -------------------- | ------------------------------------------------------ |
| `AUTH_USERNAME`      | Login username for dashboard auth                      |
| `AUTH_PASSWORD_HASH` | bcrypt hash of your password                           |
| `JWT_SECRET`         | Token signing secret (minimum 32 chars)                |
| `FRONTEND_URL`       | Allowed frontend origin (e.g. `http://localhost:5173`) |

### 4) Start the app

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- API Docs (Swagger): `http://localhost:3001/api/docs`

## Common Commands

From repository root:

| Command                | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Start frontend + backend                |
| `npm run dev:frontend` | Start frontend only                     |
| `npm run dev:backend`  | Start backend only                      |
| `npm run build`        | Build frontend + backend                |
| `npm run start`        | Start production backend bundle         |
| `npm run lint`         | Run lint across workspaces              |
| `npm run format`       | Format code                             |
| `npm run test`         | Run workspace tests                     |
| `npm run clean`        | Remove workspace `node_modules` folders |

## Project Structure

```text
Watchman/
├── apps/
│   ├── frontend/        # React + TypeScript + Vite app
│   └── backend/         # Node.js + Express API + WebSocket
├── docs/                # Knowledge base and project documentation
├── packages/            # Shared packages (workspace-ready)
├── tests/               # Additional integration/e2e tests
└── tools/               # Development and maintenance scripts
```

## API and Security

- OpenAPI spec: [`apps/backend/openapi.yaml`](./apps/backend/openapi.yaml)
- Interactive docs: `GET /api/docs` (when backend is running)
- Auth model: JWT in HTTP-only cookies (+ optional Authorization header support)
- CSRF: double-submit cookie pattern for state-changing routes
- Rate limiting: tiered by endpoint category

Read more:

- [`docs/api/index.md`](./docs/api/index.md)
- [`docs/security/index.md`](./docs/security/index.md)
- [`docs/security/authentication.md`](./docs/security/authentication.md)

## Docs for Users and Developers

| Topic                 | Link                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------- |
| Getting Started       | [`docs/getting-started.md`](./docs/getting-started.md)                                 |
| Setup Guide           | [`docs/guides/setup.md`](./docs/guides/setup.md)                                       |
| Common Tasks          | [`docs/common-tasks.md`](./docs/common-tasks.md)                                       |
| Architecture          | [`docs/architecture/index.md`](./docs/architecture/index.md)                           |
| Integrations          | [`docs/integrations/index.md`](./docs/integrations/index.md)                           |
| Environment Variables | [`docs/reference/environment-variables.md`](./docs/reference/environment-variables.md) |
| Troubleshooting       | [`docs/troubleshooting.md`](./docs/troubleshooting.md)                                 |
| Contributing          | [`docs/guides/contributing.md`](./docs/guides/contributing.md)                         |

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a focused feature/fix branch
3. Add/update tests and docs with your changes
4. Run lint/build/test locally
5. Open a pull request with clear context

Contribution guide: [`docs/guides/contributing.md`](./docs/guides/contributing.md)

## License

This project is licensed under **AGPL-3.0-only**.
See [`LICENSE`](./LICENSE) for details.
