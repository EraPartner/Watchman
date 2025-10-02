Deploy with Cloudflare Origin CA (Caddy + Docker)

Overview
- This setup runs a Caddy reverse proxy in Docker using a Cloudflare Origin CA certificate mounted at `./docker/certs/origin.pem` and `./docker/certs/origin.key`.
- Backend listens on internal port 3001, frontend serves static build on port 5000.

Steps (fish shell)

1) Create the certs directory and place the origin cert + key there

```fish
mkdir -p docker/certs
# Copy the files you downloaded from Cloudflare into this folder
# e.g. cp ~/Downloads/origin.pem docker/certs/origin.pem
# e.g. cp ~/Downloads/origin.key docker/certs/origin.key
chmod 640 docker/certs/origin.pem docker/certs/origin.key
```

2) Update `docker/Caddyfile` and replace `watchman.example.com` with your real hostname.

3) Start the stack (build images and run containers)

```fish
# Build and start
docker compose up -d --build
```

4) Verify

```fish
# follow logs for Caddy
docker compose logs -f caddy
# check backend health
docker compose exec backend curl -f http://localhost:3001/health
# check frontend is serving
docker compose exec frontend curl -f http://localhost:5000 || true
```

4) Cloudflare Dashboard
- In your Cloudflare zone, go to SSL/TLS → Origin Server → create an Origin Certificate for the hostname.
- Upload the certificate and private key files to `docker/certs` as `origin.pem` and `origin.key`.
- In SSL/TLS → Overview, set SSL/TLS mode to "Full (strict)".

Security notes
- `origin.pem` and `origin.key` are only trusted by Cloudflare; keep them private.
- Restrict inbound traffic to Cloudflare IPs if your origin is accessible from the internet.

Troubleshooting
- If Caddy fails to start, check `docker compose logs caddy` for errors about file paths or permissions.
- If you see `permission denied` for cert files, verify file ownership and that Docker can read them.
- If you get certificate errors after disabling Cloudflare proxy (grey-cloud), remember origin certs are not browser-trusted.
