# Watchman

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)
![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933?logo=nodedotjs&logoColor=white)
![Monorepo](https://img.shields.io/badge/monorepo-npm%20workspaces-CB3837?logo=npm&logoColor=white)
![API](https://img.shields.io/badge/API-OpenAPI%203.1-6BA539)
[![GitHub Issues](https://img.shields.io/github/issues/EraPartner/Watchman)](https://github.com/EraPartner/Watchman/issues)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/EraPartner/Watchman)](https://github.com/EraPartner/Watchman/commits/main)
[![GitHub Stars](https://img.shields.io/github/stars/EraPartner/Watchman?style=social)](https://github.com/EraPartner/Watchman/stargazers)

Watchman is a full-stack dashboard for **monitoring self-hosted services** from one place.
It combines a React + TypeScript frontend with a Node.js + Fastify backend and supports real-time status visibility across your stack.

> [!IMPORTANT]
> **Monitoring-only by design**
>
> Watchman is intentionally **read-only**. It does **not** start/stop/restart/reconfigure services.

## Why Watchman?

If you run multiple services, Watchman gives you one dashboard instead of 10+ browser tabs.

| You need...                                 | Watchman gives you...                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Fast visibility across services             | Unified health + stats endpoints and cards in a single UI                                                                                       |
| Support for multiple instances of a service | Numbered env-based multi-instance support (e.g. multiple qBittorrent/Synology instances)                                                        |
| Live status updates                         | WebSocket-based real-time updates                                                                                                               |
| A trusted-network security model            | Origin allow-list (CORS + WebSocket), service secrets encrypted at rest, PII-redacted logs — no auth/CSRF/rate-limiting by design (single-user) |
| Extensibility                               | Factory-driven service integration architecture                                                                                                 |

## Feature Highlights

- ✅ Unified dashboard for self-hosted service health and statistics
- ✅ Monitoring-only architecture (no service control plane)
- ✅ Multi-instance support for selected integrations
- ✅ Real-time updates via WebSockets
- ✅ OpenAPI 3.1 spec (`apps/backend/openapi.yaml`) — no Swagger UI is served
- ✅ Circuit breaker + caching patterns for resilient service polling
- ✅ Trusted-network security model — origin allow-list, encrypted secrets at rest, PII-redacted logging

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

| Layer    | Stack                                                    | Responsibility                                         |
| -------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query | Dashboard UI, server state (React Query), live updates |
| Backend  | Node.js, Fastify 5, WebSocket (`ws`), DuckDB, OpenAPI    | Service polling, REST + WebSocket API, config store    |
| Monorepo | npm workspaces                                           | Shared development workflow for frontend/backend       |

## Quick Start

### Option A — macOS Desktop (recommended for end users)

The `install.sh` script sets up everything from scratch — Homebrew, Node.js, workspace dependencies, and a `.app` launcher:

```bash
git clone https://github.com/EraPartner/Watchman.git
cd Watchman
./install.sh
```

After installation, double-click the `Launch Watchman.command` shortcut or run:

```bash
npm run electron:prod
```

> On first launch you'll need `apps/backend/.env.local` populated. The installer prints a copy hint if it's missing.

### Option B — Native production self-host (any platform)

```bash
git clone https://github.com/EraPartner/Watchman.git
cd Watchman
npm run deps:ci:portable
cp apps/backend/.env.example apps/backend/.env.local   # set WATCHMAN_MASTER_KEY

npm run build
npm run start
```

| Service            | URL                     |
| ------------------ | ----------------------- |
| Frontend (preview) | `http://localhost:4173` |
| Backend API        | `http://localhost:3001` |

### Option C — Development mode

```bash
git clone https://github.com/EraPartner/Watchman.git
cd Watchman
npm run deps:ci:portable
cp apps/backend/.env.example apps/backend/.env.local

npm run dev
```

| Service     | URL                     |
| ----------- | ----------------------- |
| Frontend    | `http://localhost:5173` |
| Backend API | `http://localhost:3001` |

### Backend environment

| Variable                              | Why it matters                                                      |
| ------------------------------------- | ------------------------------------------------------------------- |
| `WATCHMAN_MASTER_KEY`                 | Encrypts stored service secrets at rest — required in practice      |
| `CORS_ALLOWED_ORIGINS`                | Extra browser origins to allow (needed for non-loopback web access) |
| `BACKEND_V2_PORT` / `BACKEND_V2_HOST` | Bind address — optional (defaults `3001` / `0.0.0.0`)               |

Service connection details (hosts, tokens, etc.) are **not** env vars — they live
in the DuckDB config store, managed via the `/config` API or the UI. Full surface:
[`docs/reference/environment-variables.md`](./docs/reference/environment-variables.md).

## All Scripts

```bash
# Development
npm run dev                  # frontend + backend in watch mode (concurrent)
npm run dev:frontend         # frontend only
npm run dev:backend          # backend only
npm run backend              # alias of dev:backend

# Building
npm run build                # production build (backend + frontend)
npm run build:frontend       # frontend production build
npm run build:backend        # backend production build
npm run build:dev            # dev-mode frontend build
npm run preview              # preview production frontend build
npm run dist                 # build backend + frontend, then package Electron .app
npm run clean                # remove all node_modules / dist / out folders

# Production self-host
npm run start                # backend + frontend preview (concurrent)
npm run start:backend        # backend only
npm run start:frontend       # frontend preview only

# Linting
npm run lint                 # frontend ESLint
npm run lint:frontend        # frontend ESLint (explicit alias)
npm run lint:backend         # backend ESLint
npm run lint:fix             # autofix across workspaces
npm run format               # Prettier across workspaces
npm run format:check         # Prettier check across workspaces
npm run typecheck            # tsc across backend + frontend

# Testing
npm run test                 # backend Vitest suite
npm run test:frontend        # frontend Vitest suite
npm run test:all             # backend + frontend (concurrent)
npm run test:coverage        # frontend coverage report
npm run test:watch           # backend watch mode
npm run test:e2e             # Playwright e2e suite
npm run test:e2e:visual      # Playwright with snapshot updates

# Electron (desktop app)
npm run electron:dev         # desktop dev mode (NODE_ENV=development)
npm run electron:prod        # desktop production mode (built backend + frontend)
npm run electron:clean       # clean install, rebuild, launch

# Types
npm run generate:types       # regenerate TypeScript types from openapi.yaml
```

## Project Structure

```text
Watchman/
├── apps/
│   ├── frontend/        # React + TypeScript + Vite app (Playwright e2e in tests/)
│   ├── backend/         # Node.js + Fastify API + WebSocket
│   └── desktop/         # Electron desktop wrapper
├── docs/                # Knowledge base and project documentation
├── packaging/           # Electron release / packaging assets
├── scripts/             # Repo maintenance scripts (git hooks, …)
└── tools/               # Development and maintenance tooling
```

> `packages/*` is a reserved npm-workspace glob for future shared packages; no shared packages exist yet.

## API and Security

- OpenAPI 3.1 spec: [`apps/backend/openapi.yaml`](./apps/backend/openapi.yaml) — documentation only; no Swagger UI is served.
- **Security model:** single user on a trusted network — **no authentication, CSRF, or rate limiting, by design** (ADR-017 / ADR-025). Anyone who can reach the port can read and reconfigure, so do **not** expose the backend beyond your trusted network.
- Browser cross-origin access is gated by an origin allow-list shared by CORS and the WebSocket upgrade: desktop `watchman://`, loopback, and anything in `CORS_ALLOWED_ORIGINS`.
- Service secrets are encrypted at rest in the DuckDB config store (`WATCHMAN_MASTER_KEY`); secrets and PII are never logged.

See [`SECURITY.md`](./SECURITY.md) for the full threat model and how to report a vulnerability.

Read more:

- [`docs/api/index.md`](./docs/api/index.md)
- [`docs/security/index.md`](./docs/security/index.md)

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

Contribution guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md) · Security policy: [`SECURITY.md`](./SECURITY.md)

## License

This project is licensed under **AGPL-3.0-only**.
See [`LICENSE`](./LICENSE) for details.
