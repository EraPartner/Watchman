# Troubleshooting Guide

## Common Issues and Solutions

### Backend Issues

#### 1. Server Won't Start

**Symptom:** Backend crashes immediately or won't start

**Possible Causes & Solutions:**

**Missing Environment Variables**

```bash
# Check logs
cat backend/logs/error.log

# Validate environment
cd backend
npm run validate-env
```

**Port Already in Use**

```bash
# Find what's using port 3001
lsof -i :3001

# Kill the process
kill -9 $(lsof -ti:3001)

# Or use a different port
PORT=3002 npm start
```

**Invalid JWT Secret**

```bash
# Ensure JWT_SECRET is at least 32 characters
echo $JWT_SECRET | wc -c

# Generate a new one if needed
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Missing Dependencies**

```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

#### 2. Authentication Failures

**Symptom:** Login returns 401 or tokens invalid

**Solutions:**

**Incorrect Password Hash**

```bash
# Generate correct hash
cd backend
node test-password.js your-password

# Update AUTH_PASSWORD_HASH in .env.local
```

**JWT Token Issues**

```bash
# Check JWT_SECRET is set and consistent
grep JWT_SECRET backend/.env.local

# Verify token expiry settings
# Tokens expire after 8 hours by default
```

**CSRF Token Mismatch**

```bash
# Ensure cookies are enabled in browser
# Check FRONTEND_URL matches actual frontend URL
# Clear browser cookies and try again
```

#### 3. Service Connection Failures

**Symptom:** Services show as offline despite being running

**Solutions:**

**Network Connectivity**

```bash
# Test service directly
curl -v http://192.168.1.10:5213  # Example for AdGuard

# Check from backend server
cd backend
node -e "fetch('http://192.168.1.10:5213').then(r => console.log('OK')).catch(e => console.error(e))"
```

**Incorrect Configuration**

```bash
# Verify environment variables
grep ADGUARD backend/.env.local

# Check service is accessible
ping 192.168.1.10
telnet 192.168.1.10 5213
```

**Firewall Issues**

```bash
# Check firewall rules
sudo ufw status
sudo iptables -L

# Allow port if needed
sudo ufw allow 5213
```

**Authentication Errors**

```bash
# Verify API tokens/credentials
# Test authentication manually
curl -H "Authorization: Bearer YOUR_TOKEN" http://service/api
```

#### 4. High Memory Usage

**Symptom:** Backend consuming excessive memory

**Solutions:**

**Clear Cache**

```bash
# API endpoint to clear cache
curl -X POST http://localhost:3001/api/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"type":"all"}'
```

**Adjust Node Memory Limit**

```bash
# Increase memory limit if needed
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

**Memory Leak Investigation**

```bash
# Monitor memory usage
node --inspect server.js
# Open chrome://inspect in Chrome
# Take heap snapshots to identify leaks
```

#### 5. Rate Limiting Issues

**Symptom:** 429 Too Many Requests errors

**Solutions:**

**Check Rate Limits**

```javascript
// backend/middleware/rateLimiting.js
// Adjust limits if needed:
windowMs: 15 * 60 * 1000,  // 15 minutes
max: 100  // requests per window
```

**Whitelist IPs**

```bash
# Add your IP to whitelist
curl -X POST http://localhost:3001/api/security/ip-control/whitelist \
  -H "Content-Type: application/json" \
  -d '{"ip":"YOUR_IP","action":"add"}'
```

### Frontend Issues

#### 1. Build Failures

**Symptom:** `npm run build` fails

**Solutions:**

**TypeScript Errors**

```bash
# Check for type errors
npm run type-check

# Common fixes:
# - Update type definitions: npm install @types/node --save-dev
# - Add missing imports
# - Fix type mismatches
```

**Dependency Issues**

```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# Update dependencies
npm update
```

**Memory Errors**

```bash
# Increase Node memory for build
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

#### 2. API Connection Issues

**Symptom:** Frontend can't connect to backend

**Solutions:**

**CORS Errors**

```bash
# Ensure FRONTEND_URL is correct in backend/.env.local
FRONTEND_URL=http://localhost:5173

# Check CORS configuration in backend/server.js
# Restart backend after changes
```

**Wrong API URL**

```bash
# Check frontend API configuration
# Create .env.local in frontend root:
VITE_API_URL=http://localhost:3001

# Verify in browser console:
console.log(import.meta.env.VITE_API_URL)
```

**Network Tab Shows Failed Requests**

```bash
# Check backend is running
curl http://localhost:3001/health

# Verify port forwarding if using Docker
docker ps
```

#### 3. Components Not Rendering

**Symptom:** Blank page or components missing

**Solutions:**

**Check Browser Console**

```javascript
// Open DevTools (F12)
// Look for errors in Console tab
// Common issues:
// - Module not found
// - Undefined variable
// - Failed to fetch
```

**React Error Boundaries**

```typescript
// Add error boundary logging
<ErrorBoundary
  onError={(error, errorInfo) => {
    console.error("Caught error:", error, errorInfo);
  }}
>
  <YourComponent />
</ErrorBoundary>
```

**Clear Browser Cache**

```bash
# Hard reload: Ctrl+Shift+R (Linux/Windows) or Cmd+Shift+R (Mac)
# Or clear cache in DevTools > Network > Disable cache
```

#### 4. Slow Performance

**Symptom:** UI is sluggish or unresponsive

**Solutions:**

**Check Network Requests**

```javascript
// Open DevTools > Network tab
// Look for:
// - Slow requests (>500ms)
// - Failed requests
// - Too many requests

// Optimize polling intervals
const { data } = useQuery({
  queryKey: ["service"],
  queryFn: fetchService,
  refetchInterval: 60000, // Increase from 30000
});
```

**React DevTools Profiler**

```bash
# Install React DevTools browser extension
# Use Profiler tab to identify slow components
# Look for unnecessary re-renders
```

**Bundle Size Analysis**

```bash
# Analyze bundle size
npm run build -- --analyze

# Lazy load routes
const Dashboard = lazy(() => import('./pages/Dashboard'));
```

### Deployment Issues

#### 1. Production Build Not Working

**Symptom:** Works in dev but fails in production

**Solutions:**

**Environment Variables**

```bash
# Ensure production env vars are set
NODE_ENV=production
FRONTEND_URL=https://your-domain.com

# Check which env file is loaded
node -e "require('dotenv').config(); console.log(process.env)"
```

**HTTPS/SSL Issues**

```bash
# Verify SSL certificates
sudo certbot certificates

# Renew if needed
sudo certbot renew

# Check Nginx SSL config
sudo nginx -t
```

**Static Files Not Loading**

```bash
# Check Nginx config for correct root path
root /var/www/watchman/dist;

# Verify file permissions
ls -la /var/www/watchman/dist/
sudo chown -R www-data:www-data /var/www/watchman/
```

#### 2. PM2 Issues

**Symptom:** PM2 process keeps restarting

**Solutions:**

**Check Logs**

```bash
# View error logs
pm2 logs watchman-backend --err

# Check for crash dumps
ls ~/.pm2/logs/
```

**Increase Memory Limit**

```javascript
// ecosystem.config.js
{
  max_memory_restart: '1G',  // Increase from 500M
}
```

**Fix Startup Script**

```bash
# Regenerate startup script
pm2 unstartup
pm2 startup
pm2 save
```

#### 3. Database/Storage Issues

**Symptom:** Data not persisting or corrupted

**Solutions:**

**Check Disk Space**

```bash
df -h
# Free up space if needed
du -sh /var/* | sort -rh | head -20
```

**File Permissions**

```bash
# Ensure backend can write to logs
chmod -R 755 backend/logs/
chown -R $USER:$USER backend/logs/
```

### Service-Specific Issues

#### AdGuard

**Issue:** Can't connect or toggle protection

```bash
# Test AdGuard API directly
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://your-adguard:5213/control/status

# Check AdGuard is running
sudo systemctl status AdGuardHome

# Verify token is correct
grep ADGUARD_MAIN_AUTH backend/.env.local
```

#### Bitcoin Node

**Issue:** RPC connection failures

```bash
# Test RPC over Tor
curl --socks5-hostname 127.0.0.1:9050 \
  --user rpcuser:rpcpass \
  --data-binary '{"jsonrpc":"1.0","id":"curl","method":"getblockchaininfo","params":[]}' \
  http://your-onion-address.onion:8332

# Check Tor is running
systemctl status tor

# Verify bitcoin.conf has RPC enabled
cat ~/.bitcoin/bitcoin.conf | grep rpc
```

#### SSH-based Services (Mac Mini, Synology)

**Issue:** SSH connection failures

```bash
# Test SSH manually
ssh user@192.168.1.10

# Check SSH key permissions
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub

# Add to SSH config if needed
cat >> ~/.ssh/config << EOF
Host myserver
  HostName 192.168.1.10
  User admin
  IdentityFile ~/.ssh/id_rsa
  StrictHostKeyChecking no
EOF
```

## Debugging Tools

### Backend Debugging

**Enable Debug Logging**

```javascript
// backend/server.js
import debug from 'debug';
const log = debug('watchman:server');

log('Server starting...');
log('Config: %O', config);

// Run with debug output
DEBUG=watchman:* npm start
```

**Request Logging**

```bash
# View request logs
tail -f backend/logs/app.log | grep REQUEST

# Filter by error
tail -f backend/logs/error.log
```

**Performance Profiling**

```bash
# Start with profiler
node --prof server.js

# Generate profile
node --prof-process isolate-*.log > profile.txt
```

### Frontend Debugging

**React Query DevTools**

```typescript
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>;
```

**Network Monitoring**

```javascript
// Add request interceptor
axios.interceptors.request.use((request) => {
  console.log("Starting Request", request);
  return request;
});

axios.interceptors.response.use((response) => {
  console.log("Response:", response);
  return response;
});
```

## Getting Help

### Information to Provide

When seeking help, include:

1. **Error Messages**

    - Full error text
    - Stack trace
    - Log files

2. **Environment**

    - OS and version
    - Node.js version
    - Browser (for frontend issues)
    - Deployment method

3. **Steps to Reproduce**

    - What you did
    - What you expected
    - What actually happened

4. **Configuration**
    - Relevant environment variables (redact secrets!)
    - Service versions
    - Network setup

### Support Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community support
- **Documentation**: Check docs/ folder first
- **Stack Overflow**: Tag with `watchman-dashboard`

## Preventive Measures

### Regular Maintenance

```bash
# Update dependencies monthly
npm update
cd backend && npm update

# Clean up logs (keep last 30 days)
find backend/logs -name "*.log" -mtime +30 -delete

# Backup configuration
tar -czf backup-$(date +%Y%m%d).tar.gz \
  backend/.env.local \
  ecosystem.config.js

# Monitor disk space
df -h
```

### Health Checks

```bash
# Setup cron job for health checks
crontab -e

# Add line:
*/5 * * * * curl -f http://localhost:3001/health || echo "Backend down" | mail -s "Alert" you@email.com
```

### Log Rotation

```bash
# Setup logrotate for backend logs
sudo nano /etc/logrotate.d/watchman

# Add:
/opt/watchman/backend/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 watchman watchman
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Still Having Issues?

If you've tried the above and still experiencing problems:

1. Enable debug logging
2. Collect relevant logs
3. Document reproduction steps
4. Open a GitHub issue with details

Remember: The more information you provide, the faster we can help!
