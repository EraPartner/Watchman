# Watchman

A centralized dashboard to monitor and control self‑hosted services (AdGuard Home, Synology, Tor, Bitcoin, qBittorrent, and more).

This repository contains a Vite + React TypeScript frontend and a Node.js/Express backend that expose health and control endpoints for various services. The app is built for local, home‑lab, and small production deployments.

---

## Highlights

- Modern frontend: React + TypeScript + Vite
- Backend: Node.js (Express) with modular services
- Real-time status, service health checks, and control endpoints
- CI workflow with smoke tests for the backend and build/test steps for the frontend
- Designed to be deployed on a single server or as separate frontend/backend services

---

## Table of contents

- [Quickstart (development)](#quickstart-development)
- [Production build & deploy](#production-build--deploy)
- [Environment variables](#environment-variables)
- [CI / GitHub Actions](#ci--github-actions)
- [Docker / Docker Compose example](#docker--docker-compose-example)
- [Troubleshooting & debugging](#troubleshooting--debugging)
- [Security notes](#security-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Quickstart (development)

Prerequisites:
- Node.js 18+ and npm
- Git

Clone and install:

```bash
git clone <YOUR_REPO_URL>
cd Watchman
npm ci
npm run backend:install
```

Run frontend and backend concurrently (dev mode):

```bash
# run frontend + backend together
npm run dev:both
```

- Frontend: http://localhost:5173 (default)
- Backend: http://localhost:3001 (default)

Useful scripts

- `npm run dev` — start the frontend dev server (Vite)
- `npm run dev:backend` — start the backend (`cd backend && npm run dev`) with nodemon
- `npm run dev:both` — run frontend and backend concurrently
- `npm run build` — build frontend for production
- `npm run format` — run Prettier
- `npm run check:types` — TypeScript typecheck
- `npm test` — run unit tests (vitest)

---

## Production build & deploy

1. Build the frontend:

```bash
npm ci
npm run build
```

2. Serve the `dist/` directory with a static server or a CDN. Common options:
- Nginx or Caddy (reverse proxy + static serve)
- Upload `dist/` to an object storage or static hosting (Netlify, Vercel, etc.)

3. Start the backend in production mode (on the server):

```bash
cd backend
npm ci
# ensure environment is provided (see below)
NODE_ENV=production npm start
```

Consider running the backend under a process manager (systemd, pm2) and put an HTTP(S) reverse proxy (Nginx/Caddy) in front to enable TLS, request buffering and headers.

### Example Nginx reverse proxy snippet

```nginx
server {
  listen 80;
  server_name watchman.example.com;

  location / {
    root /var/www/watchman/dist;
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

---

## Environment variables

- Frontend: uses Vite. Prefix environment vars with `VITE_` to expose to the client.
  - Example: `VITE_FRONTEND_PORT`, `VITE_HMR_PORT`

- Backend: the backend reads `.env.local` in the repo root (or `backend/.env.local` depending on your setup). Copy `backend/.env.example` to `backend/.env.local` and update values.

Common backend env variables (examples — confirm in `backend/server.js` and middleware files):

```
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://watchman.example.com
CSRF_COOKIE_NAME=csrfToken
ADGUARD_MAIN_URL=http://127.0.0.1:5213
IPFS_API_URL=http://127.0.0.1:5001
IPFS_WEB_UI_URL=http://127.0.0.1:8080
```

Security note: Do not commit `.env.local` or secrets to Git. Use your host's secret manager or environment variable injection for production.

---

## CI / GitHub Actions

This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that:

- Runs two separate jobs:
  - `smoke-test`: installs backend deps, starts the backend in the runner, and polls `/health` to ensure the server boots (uploads `backend-start.log` artifact for debugging).
  - `build`: installs root deps, runs format-check + typecheck, runs tests, and builds the frontend (uploads `dist` as artifact).

Manual runs are supported via `workflow_dispatch` in the workflow. If you change package dependencies, ensure `package-lock.json` is committed so `npm ci` on the runner installs consistent deps.

---

## Docker / Docker Compose example

Below is a minimal Docker Compose example to run frontend (static) and backend. Adjust images, build contexts, and environment variables to your environment.

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
      - PORT=3001
      - FRONTEND_URL=https://watchman.example.com
    ports:
      - 3001:3001
    restart: unless-stopped

  frontend:
    image: nginx:alpine
    volumes:
      - ./dist:/usr/share/nginx/html:ro
    ports:
      - 80:80
    restart: unless-stopped
```

This assumes you built the frontend locally (`npm run build`) and have a Dockerfile for the backend.

---

## Troubleshooting & debugging

- Build fails with `Cannot find package 'babel-plugin-transform-react-remove-prop-types'`:
  - Ensure `babel-plugin-transform-react-remove-prop-types` is installed as a devDependency and `package-lock.json` is committed.
  - Run `npm ci` then `npm run build` locally to reproduce and debug.

- Backend `/health` not responding in CI smoke-test:
  - Download the `backend-start-log` artifact from the workflow run to inspect startup errors.
  - Ensure required external services (Tor, Synology, etc.) are either mocked or their absence is handled gracefully by the service manager.

- ESLint / Prettier issues in CI:
  - Run `npm run format` and `npm run format:check` locally, commit changes, and push. CI uses `npm run format:check` and `npm run check:types`.

---

## Security notes

- Use `FRONTEND_URL` to restrict allowed CORS origins in production (do not use `*`).
- Keep secrets out of source control. Use environment-based secret injection or a secrets manager.
- Use HTTPS (TLS) in front of both the frontend and backend services.
- Set `secure` cookie flags and proper SameSite policies in production — see `backend/server.js` cookie configuration.

---

## Contributing

We welcome contributions. Please follow these steps:

1. Fork the repo and create a feature branch.
2. Keep changes focused and atomic.
3. Run format & typecheck locally:

```bash
npm run format
npm run check:types
npm test
```

4. Open a pull request with a clear description of the change.

If you plan to add a new service integration, follow the existing `services/` pattern and add UI components under `src/components`.

---

## License

This project is licensed under the MIT License — see the `LICENSE` file for details.

---

If you want, I can also:
- Add a `docs/DEPLOY.md` with step-by-step production deployment (systemd/pm2/Nginx examples).
- Add a `docker-compose.yml` in the repo for easy local deployments.
- Add a small healthcheck script for the runner that also validates a simple authenticated API endpoint.

Which of those would you like next?