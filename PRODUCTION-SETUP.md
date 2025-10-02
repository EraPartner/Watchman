# Production Deployment Guide

## Critical Security Issues Fixed

### 1. Environment Variables Security
- ✅ **FIXED**: Removed committed `.env.local` files with sensitive credentials
- ✅ **FIXED**: Updated `.gitignore` to properly exclude all environment files
- ✅ **FIXED**: Created secure `.env.example` templates
- ⚠️  **ACTION REQUIRED**: Generate new credentials using the guide below

### 2. Server Security Enhancements
- ✅ **FIXED**: Added production environment validation
- ✅ **FIXED**: Enhanced security headers with Helmet
- ✅ **FIXED**: Improved CORS configuration
- ✅ **FIXED**: Added graceful shutdown handling
- ✅ **FIXED**: Enhanced error handling and logging

## Pre-Production Setup

### 1. Generate Secure Credentials

```bash
# Generate JWT secret (32+ characters) - REQUIRED
openssl rand -hex 32

# Generate password hash for authentication - REQUIRED
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('your_secure_password', 12));"

# Note: CSRF tokens are generated automatically per session - no secret needed
```

### 2. Environment Configuration

Copy the example files and update with your secure values:

```bash
# Frontend environment
cp .env.local.example .env.local

# Backend environment  
cp backend/.env.example backend/.env.local
```

**CRITICAL**: Update `backend/.env.local` with:
- Strong `JWT_SECRET` (32+ characters)
- Secure `AUTH_PASSWORD_HASH` (bcrypt hashed)
- Production `FRONTEND_URL` (https://)
- Real service URLs and credentials

### 3. Production Validation

```bash
# Validate environment setup
cd backend && npm run validate-env

# Check for security vulnerabilities
npm run security-audit

# Health check
npm run health-check
```

## Caddy Reverse Proxy Configuration

Since you're using Caddy on a separate LAN host, configure it as follows:

### 1. Caddy Server Setup

Copy the Caddy configuration template:
```bash
# Copy to your Caddy host
scp Caddyfile.template user@caddy-host:/etc/caddy/Caddyfile
```

### 2. Configure Caddy Environment Variables

On your Caddy host, create `/etc/caddy/caddy.env`:
```bash
# Your domain or IP address
DOMAIN=watchman.yourdomain.com
# Or for LAN-only access:
# DOMAIN=192.168.1.10

# Backend server IP (where Watchman backend runs)
BACKEND_HOST=http://192.168.1.100:3001

# Frontend files location on Caddy host
WEBROOT=/var/www/watchman
```

### 3. Deploy Frontend Files to Caddy Host

```bash
# Build the frontend
npm run build

# Copy built files to Caddy host
rsync -av dist/ user@caddy-host:/var/www/watchman/

# Or using scp
scp -r dist/* user@caddy-host:/var/www/watchman/
```

### 4. Start Caddy with Environment

```bash
# On the Caddy host
sudo systemctl enable caddy
sudo systemctl start caddy

# Or run manually with environment
caddy run --config /etc/caddy/Caddyfile --envfile /etc/caddy/caddy.env
```

## Production Deployment Checklist

### Security Requirements
- [ ] All `.env.local` files excluded from Git
- [ ] Strong JWT secret (32+ characters)
- [ ] HTTPS enabled for frontend URL
- [ ] Secure password hashing (bcrypt)
- [ ] Rate limiting configured
- [ ] CSRF protection enabled

### Infrastructure Requirements
- [ ] Node.js 18+ installed on backend host
- [ ] Caddy installed and configured on reverse proxy host
- [ ] SSL/TLS certificates configured in Caddy
- [ ] Firewall rules configured
- [ ] Log rotation setup
- [ ] Monitoring configured

### LAN Network Configuration
- [ ] Backend server accessible from Caddy host on port 3001
- [ ] Frontend files deployed to Caddy host web directory
- [ ] Network connectivity between hosts verified
- [ ] DNS or host file entries configured if needed

### Service Configuration
- [ ] All service URLs use HTTPS where possible
- [ ] Service credentials rotated from development
- [ ] Network timeouts configured appropriately
- [ ] Service health checks working

## LAN Deployment Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Web    │    │   Caddy Host     │    │ Watchman Host   │
│   Browser       │───▶│  (Reverse Proxy) │───▶│   (Backend)     │
│                 │    │                  │    │                 │
│ https://domain  │    │ Port 80/443      │    │ Port 3001       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │ Static Files     │
                       │ /var/www/watchman│
                       └──────────────────┘
```

## Monitoring and Maintenance

### Health Endpoints
- `/health` - Basic server health (via Caddy proxy)
- `/api/services/health` - All services status

### Logging
- Caddy logs: `/var/log/caddy/watchman.log`
- Backend logs: `backend/backend.log`
- Error logs: `backend/backend_restart.log`

### Security Monitoring
- Monitor failed login attempts in backend logs
- Watch Caddy access logs for suspicious activity
- Review rate limit violations

## Emergency Procedures

### Service Restart
```bash
# Restart backend on Watchman host
pkill -SIGTERM node
npm run start:prod

# Restart Caddy on proxy host
sudo systemctl restart caddy
```

### Frontend Updates
```bash
# Build new frontend
npm run build

# Deploy to Caddy host
rsync -av --delete dist/ user@caddy-host:/var/www/watchman/

# Caddy will serve new files immediately (no restart needed)
```

### Security Breach Response
1. Immediately rotate all credentials
2. Review Caddy and backend access logs
3. Update `.env.local` files
4. Restart all services
5. Monitor for suspicious activity