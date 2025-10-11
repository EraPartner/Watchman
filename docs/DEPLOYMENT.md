# Deployment Guide

## Overview

This guide covers deploying Watchman in various environments, from development to production.

## Prerequisites

- Node.js 18+ and npm
- Environment variables configured
- Services to monitor (AdGuard, Bitcoin node, etc.)
- (Production) Domain name and SSL certificate
- (Production) Reverse proxy (Nginx recommended)

## Environment Setup

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/yourusername/watchman.git
cd watchman

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
```

### 2. Configure Environment Variables

Create `.env.local` in the backend directory:

```bash
# Copy template
cp .env.example .env.local

# Edit with your values
nano .env.local
```

Required variables:

```env
# Authentication
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=$2b$12$... # Generate with bcrypt
JWT_SECRET=your-secret-key-min-32-chars

# Server
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Services (configure as needed)
ADGUARD_MAIN_URL=http://192.168.1.10:5213
ADGUARD_MAIN_AUTH=your-token
BITCOIN_ONION_URL=your-onion-address.onion
BITCOIN_RPC_USER=username
BITCOIN_RPC_PASSWORD=password
# ... add other services
```

### 3. Generate Password Hash

```bash
cd backend
node test-password.js your-desired-password
# Copy the hash to AUTH_PASSWORD_HASH in .env.local
```

## Development Deployment

### Option 1: Separate Processes (Recommended for Dev)

Terminal 1 - Backend:

```bash
cd backend
npm start
# Runs on http://localhost:3001
```

Terminal 2 - Frontend:

```bash
npm run dev
# Runs on http://localhost:5173
```

### Option 2: Single Script

```bash
chmod +x start-dev.sh
./start-dev.sh
```

Access at `http://localhost:5173`

## Production Deployment

### Option 1: PM2 (Recommended)

#### Install PM2

```bash
npm install -g pm2
```

#### Create Ecosystem File

`ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "watchman-backend",
      script: "./backend/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "500M",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
```

#### Deploy

```bash
# Build frontend
npm run build

# Start backend with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup
# Follow the instructions shown
```

#### PM2 Commands

```bash
pm2 status              # Check status
pm2 logs watchman-backend  # View logs
pm2 restart watchman-backend  # Restart
pm2 stop watchman-backend     # Stop
pm2 delete watchman-backend   # Remove
```

### Option 2: Systemd Service

Create `/etc/systemd/system/watchman.service`:

```ini
[Unit]
Description=Watchman Backend API
After=network.target

[Service]
Type=simple
User=watchman
WorkingDirectory=/opt/watchman/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/watchman/backend/logs

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable watchman
sudo systemctl start watchman
sudo systemctl status watchman

# View logs
sudo journalctl -u watchman -f
```

### Option 3: Docker

#### Dockerfile (Backend)

`backend/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs/audit

# Run as non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

CMD ["node", "server.js"]
```

#### Docker Compose

`docker-compose.yml`:

```yaml
version: "3.8"

services:
  backend:
    build: ./backend
    container_name: watchman-backend
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    env_file:
      - ./backend/.env.local
    volumes:
      - ./backend/logs:/app/logs
    networks:
      - watchman-net

  frontend:
    image: nginx:alpine
    container_name: watchman-frontend
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    networks:
      - watchman-net
    depends_on:
      - backend

networks:
  watchman-net:
    driver: bridge
```

Deploy:

```bash
# Build frontend
npm run build

# Start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Nginx Configuration

### Development Proxy

`/etc/nginx/sites-available/watchman-dev`:

```nginx
server {
    listen 80;
    server_name watchman.local;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://localhost:3001;
    }
}
```

### Production Configuration

`/etc/nginx/sites-available/watchman`:

```nginx
# HTTP -> HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name watchman.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name watchman.yourdomain.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/watchman.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/watchman.yourdomain.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/watchman.yourdomain.com/chain.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Serve frontend
    root /var/www/watchman/dist;
    index index.html;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    # Frontend - SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Rate limiting
        limit_req zone=api burst=20 nodelay;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3001;
        access_log off;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/watchman /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL Certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d watchman.yourdomain.com

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run
```

## Environment-Specific Configuration

### Update Frontend Environment

Update `FRONTEND_URL` in backend `.env.local`:

**Development:**

```env
FRONTEND_URL=http://localhost:5173
```

**Production:**

```env
FRONTEND_URL=https://watchman.yourdomain.com
```

### Update Frontend API URL

If using Vite, create `.env.production`:

```env
VITE_API_URL=https://watchman.yourdomain.com
```

## Health Checks

### Backend Health

```bash
curl http://localhost:3001/health
```

### Service Health

```bash
curl http://localhost:3001/api/services/health
```

### Frontend (production)

```bash
curl https://watchman.yourdomain.com
```

## Backup Strategy

### What to Backup

1. **Configuration files**

    - `.env.local`
    - `nginx.conf`
    - `ecosystem.config.js`

2. **Logs** (optional)

    - `backend/logs/`

3. **SSL certificates**
    - `/etc/letsencrypt/`

### Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/backups/watchman"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup configuration
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    backend/.env.local \
    ecosystem.config.js \
    /etc/nginx/sites-available/watchman

# Backup logs (last 30 days)
find backend/logs/ -name "*.log" -mtime -30 -exec \
    tar -czf "$BACKUP_DIR/logs_$DATE.tar.gz" {} +

# Keep only last 7 backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR"
```

## Monitoring

### Process Monitoring

```bash
# PM2
pm2 monit

# Systemd
sudo systemctl status watchman
```

### Log Monitoring

```bash
# Backend logs
tail -f backend/logs/app.log

# PM2 logs
pm2 logs watchman-backend

# Systemd logs
sudo journalctl -u watchman -f
```

### Resource Usage

```bash
# Check resource usage
htop

# Check disk usage
df -h
du -sh backend/logs/
```

## Troubleshooting

### Backend Won't Start

```bash
# Check logs
cat backend/logs/error.log

# Verify environment
node backend/server.js

# Check port availability
lsof -i :3001
```

### Frontend Not Loading

```bash
# Check build
npm run build

# Verify Nginx
sudo nginx -t
sudo systemctl status nginx

# Check permissions
ls -la /var/www/watchman/dist/
```

### Services Not Connecting

```bash
# Test service connectivity
curl -v http://192.168.1.10:5213  # AdGuard example

# Check environment variables
grep ADGUARD backend/.env.local

# Verify firewall
sudo ufw status
```

## Security Hardening

See [SECURITY.md](./SECURITY.md) for production security checklist.

## Updating

### Pull Latest Changes

```bash
git pull origin main
```

### Update Dependencies

```bash
# Frontend
npm update

# Backend
cd backend
npm update
```

### Rebuild and Restart

```bash
# Build frontend
npm run build

# Restart backend
pm2 restart watchman-backend

# Or with systemd
sudo systemctl restart watchman
```

## Performance Tuning

### Node.js Options

```bash
# Increase memory limit if needed
NODE_OPTIONS="--max-old-space-size=2048" node server.js
```

### PM2 Clustering

```javascript
// ecosystem.config.js
{
  instances: 'max',  // Use all CPU cores
  exec_mode: 'cluster'
}
```

### Nginx Caching

Add to nginx config:

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m;

location /api {
    proxy_cache api_cache;
    proxy_cache_valid 200 30s;
    add_header X-Cache-Status $upstream_cache_status;
}
```

## Support

For issues and questions:

- GitHub Issues: https://github.com/yourusername/watchman/issues
- Documentation: https://github.com/yourusername/watchman/tree/main/docs
