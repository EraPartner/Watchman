# Watchman — Production Deployment Guide

This document explains production-ready deployment options for the Watchman project (frontend: Vite + React; backend: Node.js/Express). It covers build steps, a recommended systemd + Nginx setup, TLS with Let's Encrypt, a PM2 alternative, a Docker Compose example, environment variables, logging, health checks, and troubleshooting.

Target audience: sysadmins, DevOps, and maintainers who want a repeatable, secure, and reliable deployment process.

---

## Quick overview

- Build the frontend to `dist/` and serve it as static files (Nginx). Reverse-proxy `/api` to the backend.
- Run the backend as a system service (systemd) or process manager (PM2). Ensure environment variables are provided via an env file or systemd `EnvironmentFile`.
- Obtain TLS through Let's Encrypt (certbot) on the reverse proxy.
- Configure health checks and log rotation.

---

## Assumptions & paths used in examples

- Host: Ubuntu 22.04+ (commands work on most Linux distributions; adapt package manager as needed)
- App deploy directory: `/opt/watchman`
  - Backend code: `/opt/watchman/backend`
  - Frontend static files: `/opt/watchman/dist`
- Node.js 18+ installed on the host
- You control DNS for your domain `watchman.example.com`

Adjust paths and usernames to match your environment.

---

## Build steps (on CI or a build machine)

1. On build machine or CI runner, clone and install:

```bash
git clone <repo-url> /tmp/watchman
cd /tmp/watchman
npm ci
npm run backend:install   # installs backend deps
```

2. Build frontend (production):

```bash
npm run build
# produce /tmp/watchman/dist
```

3. (Optional) Run tests and typechecks:

```bash
npm run check:types
npm test
```

4. Create an archive for deployment or push artifacts to artifact storage. Example tar:

```bash
tar -czf watchman-release-$(date +%Y%m%d).tar.gz dist backend package.json package-lock.json backend/package.json
```

---

## Deploy to a single server (systemd + Nginx)

This pattern is recommended for small production installs.

### 1) Prepare the server

- Create a system user and directory

```bash
sudo useradd --system --home /opt/watchman -M watchman || true
sudo mkdir -p /opt/watchman
sudo chown -R $USER: /opt/watchman
```

- Copy release artifacts to `/opt/watchman` (SCP, rsync, CI deploy step, or extract tar)

```bash
# example using rsync from build host
rsync -avP /tmp/watchman/dist/ deploy@server:/opt/watchman/dist/
rsync -avP /tmp/watchman/backend/ deploy@server:/opt/watchman/backend/
scp package.json package-lock.json deploy@server:/opt/watchman/
```

- Install Node.js on the server (Node 18+). For Ubuntu:

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential
```

- Install backend dependencies on the server:

```bash
cd /opt/watchman/backend
npm ci --omit=dev
```

> Note: If you need dev deps on server (e.g., for runtime transpilation), omit `--omit=dev`.


### 2) Environment variables

Create an environment file for systemd or a `.env.local` file (backend reads dotenv in `backend/server.js`):

`/opt/watchman/backend/.env.local` (example values)

```
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://watchman.example.com
CSRF_COOKIE_NAME=csrfToken
ADGUARD_MAIN_URL=http://127.0.0.1:5213
IPFS_API_URL=http://127.0.0.1:5001
IPFS_WEB_UI_URL=http://127.0.0.1:8080
```

- Protect secrets (file mode 600) and ensure ownership is correct.

```bash
sudo chown watchman: /opt/watchman/backend/.env.local
chmod 600 /opt/watchman/backend/.env.local
```


### 3) systemd unit for the backend

Create `/etc/systemd/system/watchman-backend.service`:

```
[Unit]
Description=Watchman Backend
After=network.target

[Service]
Type=simple
User=watchman
WorkingDirectory=/opt/watchman/backend
EnvironmentFile=/opt/watchman/backend/.env.local
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=watchman-backend

[Install]
WantedBy=multi-user.target
```

Reload systemd and start service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now watchman-backend.service
sudo journalctl -u watchman-backend -f
```

Check health:

```bash
curl -fsS http://127.0.0.1:3001/health
```


### 4) Nginx configuration (reverse proxy and static serve)

Install Nginx and Certbot (Ubuntu example):

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create an Nginx site `/etc/nginx/sites-available/watchman`:

```
server {
  listen 80;
  server_name watchman.example.com;

  root /opt/watchman/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/watchman /etc/nginx/sites-enabled/watchman
sudo nginx -t && sudo systemctl reload nginx
```

### 5) Obtain TLS with Certbot

```bash
sudo certbot --nginx -d watchman.example.com
# enable auto-renewal (certbot installs cron job / timer by default)
```

After TLS, `FRONTEND_URL` should be `https://watchman.example.com`.


### 6) Logs & rotation

- Backend logs are in `journalctl -u watchman-backend`.
- For Nginx logs: `/var/log/nginx/access.log` and `error.log`.
- Configure `logrotate` as needed for custom setups.

---

## PM2 alternative (process manager)

If you prefer PM2 over systemd:

```bash
sudo npm install -g pm2
cd /opt/watchman/backend
pm ci
pm2 start server.js --name watchman-backend --env production
pm2 save
pm2 startup systemd    # follow printed instructions to configure startup
```

PM2 offers zero-downtime restarts and monitoring, but systemd is more standard for distribution packaging.

---

## Docker (Traefik) deployment - recommended for HTTPS

This repository includes a Traefik-enabled `docker-compose.yml` at the project root for a simple, secure, single-host deployment that obtains TLS certificates via Let's Encrypt (ACME).

Prerequisites:
- Docker Engine and Docker Compose v2 (the `docker compose` command)
- Public DNS for your domain (e.g. `watchman.example.com`) pointing at the host
- Update the `docker-compose.yml` `traefik` service command with your email address for ACME (look for `--certificatesresolvers.le.acme.email=you@example.com`)

Important: set `docker/acme.json` to mode `600` so Traefik can read/write certificates safely:

```bash
chmod 600 docker/acme.json
```

Start the stack (build images and start the services):

```bash
# build images and start containers in detached mode
docker compose up --build -d

# follow logs
docker compose logs -f traefik
docker compose logs -f backend
```

Traefik will automatically request certificates for the hostname(s) used in the `docker-compose.yml` labels (in our example `watchman.example.com`). If ACME fails, inspect Traefik logs for errors and verify domain/DNS and port 80 are reachable from the Internet.

Access the app:
- Frontend: https://watchman.example.com
- Backend API (proxied): https://watchman.example.com/api/

Notes and customizations:
- If you prefer HTTP-01 challenge instead of TLS-ALPN or TLS-ALPN, you can use `--certificatesresolvers.le.acme.httpchallenge=true` and configure a Traefik entrypoint accordingly (HTTP-01 requires Traefik to respond on port 80).
- Traefik `api` and dashboard are disabled in the compose file for security. To enable the Traefik dashboard, expose the API port and set the appropriate entry in the Traefik command (`--api.insecure=true` is only recommended for local testing).

Rolling updates and zero-downtime:
- Build new images, then run `docker compose up -d --build` on the host. Traefik will route traffic to healthy containers; ensure your backend healthcheck is accurate to avoid routing to unhealthy instances.

Security checklist for Traefik-based deployment:
- `docker/acme.json` must be writable by Traefik and only readable by the host admin: `chmod 600 docker/acme.json`.
- Use a firewall to allow TCP ports 80 and 443 only.
- Monitor certificate issuance (Traefik logs) and configure cert renewal alerts if needed.

---

## Health checks and readiness

- The backend exposes a `/health` endpoint. Your load balancer or monitoring system should check:

```bash
curl -fsS --max-time 5 http://127.0.0.1:3001/health
```

- Add a readiness probe or custom monitoring script to ensure dependent services (AdGuard, Tor, Synology) are responding if required.

---

## Zero-downtime deployment (simple approach)

1. Build new frontend and copy to a `dist-new/` directory on the server
2. Test Nginx config using a temporary location (optional)
3. Swap symlink: `/opt/watchman/dist -> /opt/watchman/dist-new`

```bash
mv /opt/watchman/dist /opt/watchman/dist-old
mv /opt/watchman/dist-new /opt/watchman/dist
sudo systemctl reload nginx
```

4. For backend, `systemctl restart watchman-backend` (or `pm2 reload watchman-backend`).

Keep old assets for quick rollback.

---

## Troubleshooting

- `Cannot find package 'babel-plugin-transform-react-remove-prop-types'` during build: commit `package-lock.json` and ensure CI runs `npm ci`. Install locally: `npm i -D babel-plugin-transform-react-remove-prop-types`.
- If backend fails to start: inspect `journalctl -u watchman-backend -b` and `backend-start.log` (CI artifact). Check `.env.local` and required external services.
- If static site returns 404s for routes: ensure `try_files $uri $uri/ /index.html;` is present so client-side routing works.

---

## Security checklist (before production)

- Set `FRONTEND_URL` to the real origin; do not use `*` for CORS in production.
- Secure cookies (see `backend/server.js` cookie options) — ensure `secure=true` behind HTTPS.
- Protect the backend admin endpoints with strong credentials and IP restrictions when possible.
- Run security scans and periodically `npm audit` and apply updates.
- Use a firewall (ufw) to restrict open ports (allow only 22/80/443 and necessary app ports on loopback).

---

## Rollback plan

- Keep the previous `dist` copy (e.g., `dist-old`) and previous backend release.
- To rollback frontend: swap symlink or restore `dist` and reload Nginx.
- To rollback backend: restore previous backend directory or use `git checkout <previous-tag>` and restart the service.

---

## Next steps I can implement for you

- Add a runnable `docker-compose.yml` in the repo and a `Dockerfile` for the backend.
- Add a `systemd` unit file to the repo as `deploy/systemd/watchman-backend.service` and a small deployment script.
- Add an automated CI `deploy` job to push artifacts to a server (via SSH) and run the deploy steps.

Tell me which of those you'd like and I will implement it.