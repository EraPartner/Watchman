# Watchman

Watchman is a full-stack dashboard for monitoring and controlling self-hosted services from one place.
It combines a React + Vite frontend with a Node.js + Express backend and supports both status monitoring and service-level actions.

## What This Project Is

Watchman helps homelab and self-hosting users keep operational visibility across multiple services without jumping between separate admin panels.

- Centralized status view for critical services
- Extensible service integration model
- API-first backend with documented endpoints
- Security-focused defaults for local and production deployments

## Key Features

- Service monitoring and health checks for integrations like AdGuard Home, Synology, Tor, Bitcoin, qBittorrent, and more
- Multi-instance support for running multiple nodes of the same service type
- Real-time updates with WebSocket-based status broadcasting
- Control and action endpoints for supported services
- Structured logging and auditability
- OpenAPI documentation with Swagger UI

## Compatibility

- Node.js 18+
- npm workspaces (monorepo)
- Frontend: modern Chromium, Firefox, Safari, and Edge browsers
- Backend: Linux/macOS environments (works well behind Nginx reverse proxy in production)

## Tech Stack

- Frontend: React 18, TypeScript, Vite, TailwindCSS, TanStack Query
- Backend: Node.js, Express, JWT auth, OpenAPI, WebSocket
- Tooling: ESLint, Prettier, Vitest

## Project Structure

```text
Watchman/
|- apps/
|  |- frontend/            # React + TypeScript + Vite app
|  `- backend/             # Node.js + Express API
|- docs/                   # Project docs and guides
|- tools/                  # Dev and maintenance scripts
|- packages/               # Shared packages (workspace-ready)
`- tests/                  # Integration and E2E tests
```

## Quick Start

### Prerequisites

- Git
- Node.js 18+
- npm

### Install and Run

```bash
git clone <YOUR_REPO_URL>
cd Watchman
npm install
npm run dev
```

Default development ports:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Scripts

From repository root:

```bash
# Development
npm run dev                # Start frontend + backend
npm run dev:frontend       # Frontend only
npm run dev:backend        # Backend only

# Build
npm run build              # Build all workspaces

# Quality
npm run lint               # Lint all workspaces
npm run format             # Format code
npm run test               # Run tests

# Maintenance
npm run clean              # Remove node_modules in workspaces
```

## Configuration

- Root env file: `.env.local`
- Backend config: `apps/backend/config.js`
- Frontend config: `apps/frontend/vite.config.ts`

Service-specific credentials and host settings should be provided through environment variables and never committed.

## Security

Watchman includes:

- JWT-based authentication
- CSRF protection
- Tiered rate limiting
- Security headers via Helmet
- Input validation and sanitization
- Structured logs with security monitoring support

Read `docs/SECURITY.md` for operational recommendations and production hardening checks.

## Documentation

Main docs index: `docs/INDEX.md`

Useful starting points:

- Architecture: `docs/ARCHITECTURE.md`
- API docs: `docs/API-DOCUMENTATION.md`
- Development guide: `docs/DEVELOPMENT.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Multi-instance docs: `docs/MULTI-INSTANCE-QUICKSTART.md`

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature/fix branch
3. Make changes with tests/docs where applicable
4. Run lint/build/test locally
5. Open a pull request with clear context

Full guidelines: `docs/CONTRIBUTING.md`

## GitHub Best Practices for This Repo

- Use descriptive PR titles and link related issues
- Keep PRs focused and small when possible
- Add screenshots/GIFs for UI changes
- Document any new configuration flags or environment variables

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

See `LICENSE` for the full text.
