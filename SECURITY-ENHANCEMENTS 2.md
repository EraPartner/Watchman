# Advanced Security Enhancements

## Overview

This document describes the comprehensive security enhancements implemented in the Watchman Backend. These features provide enterprise-grade security, monitoring, and protection against various attack vectors.

## New Security Features

### 1. Advanced Security Headers

**File:** `backend/middleware/securityHeaders.js`

- **Expect-CT**: Certificate Transparency enforcement
- **Network Error Logging (NEL)**: Detect and report security issues
- **Enhanced Permissions-Policy**: Restrict browser feature access
- **Timing Attack Protection**: Random delays to prevent timing-based attacks
- **DDoS Detection**: Real-time detection of denial-of-service patterns
- **Suspicious Pattern Detection**: Identifies SQL injection, XSS, path traversal attempts

**Features:**

- Nonce generation for CSP inline scripts
- Clear-Site-Data header on logout
- Automatic suspicious request logging
- DDoS rate tracking (50+ requests in 10 seconds triggers alert)

### 2. IP Access Control

**File:** `backend/middleware/ipControl.js`

Comprehensive IP whitelist/blacklist management system:

- **Whitelist Mode**: Restrict access to specific IP addresses
- **Blacklist**: Permanently block malicious IPs
- **Temporary Blocks**: Auto-expiring IP blocks (default: 1 hour)
- **Persistent Storage**: IP lists saved to `config/ip-control.json`
- **Auto-cleanup**: Expired temp blocks removed automatically

**Default Behavior:**

- Localhost (127.0.0.1, ::1) always whitelisted
- If no non-localhost IPs in whitelist, all IPs allowed
- Once whitelist has other IPs, only whitelisted IPs can access

**API Endpoints:**

```
GET  /api/security/ip-control          - View current IP lists
POST /api/security/ip-control/whitelist - Add/remove IPs from whitelist
POST /api/security/ip-control/blacklist - Add/remove IPs from blacklist
```

### 3. Comprehensive Audit Logging

**File:** `backend/middleware/auditLogger.js`

Creates detailed audit trails for all security-relevant events:

- **Authentication Events**: Login attempts, successes, failures
- **Authorization Events**: Access control decisions
- **Data Access**: All authenticated API requests
- **Configuration Changes**: System setting modifications
- **Service Control**: Service start/stop/restart actions
- **Security Events**: Attacks, violations, suspicious activity

**Log Storage:**

- Daily log files: `logs/audit/audit-YYYY-MM-DD.log`
- JSON format for easy parsing
- Automatic sensitive data redaction (passwords, tokens, keys)

**Audit Event Types:**

```javascript
auditLogger.logAuthentication(username, ip, success, metadata);
auditLogger.logAuthorization(username, ip, resource, action, allowed);
auditLogger.logDataAccess(username, ip, resource, action);
auditLogger.logConfigChange(username, ip, setting, oldValue, newValue);
auditLogger.logSecurityEvent(type, ip, severity, description);
auditLogger.logServiceControl(username, ip, service, action, success);
```

### 4. Real-time Security Monitoring

**File:** `backend/middleware/securityMonitor.js`

Active threat detection and alerting system:

**Monitored Events:**

- Failed login attempts (threshold: 5 in 5 minutes)
- Suspicious patterns (threshold: 3 in 1 minute)
- Rate limit violations (threshold: 10 in 5 minutes)
- Unauthorized access attempts (threshold: 3 in 5 minutes)

**Alert System:**

- Real-time alert generation
- Alert severity levels: low, medium, high, critical
- In-memory alert storage (last 1000 alerts)
- WebSocket notification support (ready for integration)
- Extensible for email/webhook/SIEM integration

**API Endpoints:**

```
GET /api/security/alerts - Retrieve security alerts
GET /api/security/stats  - Security monitoring statistics
```

**Alert Subscription:**

```javascript
const unsubscribe = securityMonitor.subscribe((alert) => {
  // Handle alert (send email, webhook, etc.)
  console.log("Security Alert:", alert);
});
```

### 5. Advanced Input Sanitization & Validation

**File:** `backend/middleware/inputSanitization.js`

Multi-layer input protection:

**Sanitization:**

- XSS prevention: Remove `<>`, javascript:, event handlers
- Deep object sanitization (recursive)
- Applied to body, query, params

**Attack Detection:**

- SQL Injection patterns
- XSS attempts
- Path traversal (../)
- Command injection
- All attempts logged for forensics

**Password Security:**

- Minimum 12 characters
- Requires: uppercase, lowercase, number, special char
- Common password dictionary check
- Strength scoring (0-100)

**User Action Rate Limiting:**

- Per-user, per-action limits
- Password changes: 3/hour
- Settings changes: 10/10 minutes
- Service control: 30/minute
- Independent from IP-based rate limiting

**Functions:**

```javascript
validatePasswordStrength(password); // Returns validation result
sanitizeString(input); // Clean single string
deepSanitize(object); // Clean entire object
hasSQLInjection(input); // Check for SQL patterns
hasXSS(input); // Check for XSS patterns
hasPathTraversal(input); // Check for path traversal
```

## Security Architecture

### Middleware Stack Order

1. **requestIdMiddleware** - Request tracking
2. **requestLogger** - Structured logging
3. **performanceMonitor** - Performance tracking
4. **advancedSecurityHeaders** - Enhanced headers
5. **ddosProtection** - DDoS mitigation
6. **enforceIPControl** - IP whitelist/blacklist
7. **monitorSecurityEvents** - Real-time monitoring
8. **suspiciousPatternDetection** - Attack detection
9. **sanitizeInputs** - Input cleaning
10. **validateInputSecurity** - Injection prevention
11. **auditMiddleware** - Audit logging
12. **helmet** - Additional security headers
13. **compression** - Response compression
14. **cors** - CORS policy
15. **express.json** - JSON parsing
16. **cookieParser** - Cookie parsing

### Authentication Flow with Security

```
1. Request arrives → IP check (whitelist/blacklist)
2. DDoS detection → Pattern analysis
3. Input sanitization → Validation
4. Account lockout check (5 failed attempts)
5. Credential validation (timing-safe)
6. Rate limiting check
7. Audit logging
8. Token generation
9. Security monitoring
```

### Admin Endpoints Security

Admin endpoints require **both** authentication AND whitelisted IP:

```javascript
app.get('/api/security/alerts', requireAuth, requireWhitelistedIP, ...)
```

This dual-layer protection ensures critical operations are only accessible from trusted networks.

## Configuration

### Environment Variables

Add to `.env.local`:

```bash
# IP Whitelisting (optional)
# Leave empty to allow all IPs, or specify trusted IPs
TRUSTED_IPS=192.168.1.100,192.168.1.101

# Security Alert Thresholds (optional)
FAILED_LOGIN_THRESHOLD=5
FAILED_LOGIN_WINDOW=300000  # 5 minutes in ms

# Rate Limiting (optional)
MAX_REQUESTS_PER_WINDOW=100
RATE_LIMIT_WINDOW=60000  # 1 minute

# DDoS Protection (optional)
DDOS_THRESHOLD=50
DDOS_WINDOW=10000  # 10 seconds
```

### IP Control Configuration

Managed via API or configuration file `backend/config/ip-control.json`:

```json
{
  "whitelist": ["127.0.0.1", "::1", "192.168.1.100"],
  "blacklist": ["10.0.0.123", "172.16.0.50"]
}
```

## Security Monitoring Dashboard (Future)

The security monitoring system is ready for dashboard integration:

**Metrics Available:**

- Total security alerts
- Alerts by severity
- Alerts by type
- Active threats
- Blocked IPs
- Failed login attempts
- Suspicious activity patterns

**WebSocket Events:**

```javascript
// Subscribe to real-time alerts
ws.on("security:alert", (alert) => {
  // Display in dashboard
});

ws.on("security:stats", (stats) => {
  // Update metrics
});
```

## Best Practices

### 1. Initial Setup

```bash
# 1. Add your IP to whitelist (prevents lockout)
curl -X POST http://localhost:3001/api/security/ip-control/whitelist \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"ip": "YOUR_IP", "action": "add"}'

# 2. Enable whitelist mode by adding non-localhost IPs
# This automatically restricts access to whitelisted IPs only
```

### 2. Monitoring Logs

```bash
# View audit logs
tail -f backend/logs/audit/audit-$(date +%Y-%m-%d).log | jq

# View security alerts
tail -f backend/backend.log | grep "SECURITY ALERT"

# Monitor failed logins
tail -f backend/backend.log | grep "Failed login"
```

### 3. Responding to Security Events

**High-severity alerts:**

1. Investigate immediately
2. Check audit logs for full context
3. Block offending IPs if necessary
4. Review access patterns
5. Update security rules

**IP Blocking:**

```bash
# Temporary block (1 hour)
curl -X POST http://localhost:3001/api/security/ip-control/blacklist \
  -d '{"ip": "MALICIOUS_IP", "action": "add", "duration": 3600000}'

# Permanent block
curl -X POST http://localhost:3001/api/security/ip-control/blacklist \
  -d '{"ip": "MALICIOUS_IP", "action": "add"}'
```

### 4. Regular Security Reviews

- Review audit logs weekly
- Check security alerts daily
- Update IP whitelist as needed
- Rotate credentials quarterly
- Run `npm audit` monthly

## Attack Scenarios & Mitigations

### SQL Injection

- **Detection:** Input validation middleware
- **Prevention:** Input sanitization, prepared statements
- **Response:** Request blocked, IP logged, alert raised

### XSS (Cross-Site Scripting)

- **Detection:** Pattern matching on inputs
- **Prevention:** Content Security Policy, input sanitization
- **Response:** Request blocked, suspicious activity logged

### Brute Force Login

- **Detection:** Failed login tracking
- **Prevention:** Account lockout after 5 attempts (15 min)
- **Response:** Temporary IP block, security alert

### DDoS

- **Detection:** Request rate monitoring (50+ req/10s)
- **Prevention:** Rate limiting, temporary IP blocks
- **Response:** Automatic IP blocking, alert raised

### Account Enumeration

- **Detection:** Timing attack protection
- **Prevention:** Constant-time password comparison
- **Response:** Random delays on all auth responses

## Performance Impact

The security enhancements are designed for minimal overhead:

- **Middleware latency:** < 5ms average
- **Audit logging:** Async, non-blocking
- **Memory usage:** ~10MB for monitoring data
- **Disk I/O:** Minimal (append-only logs)

## Testing Security Features

```bash
# Test IP blocking
curl http://localhost:3001/api/auth/login  # Should work
# Add your IP to blacklist, then:
curl http://localhost:3001/api/auth/login  # Should return 403

# Test rate limiting
for i in {1..200}; do
  curl http://localhost:3001/health
done
# Should eventually return 429

# Test input sanitization
curl -X POST http://localhost:3001/api/auth/login \
  -d '{"username":"admin","password":"<script>alert(1)</script>"}'
# Should be sanitized and logged as suspicious

# View security alerts
curl http://localhost:3001/api/security/alerts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Future Enhancements

Planned security improvements:

1. **Two-Factor Authentication (2FA)** - TOTP support
2. **Rate Limiting by User** - Per-user quotas
3. **Geolocation Blocking** - Block by country
4. **Email Alerts** - Automated security notifications
5. **Webhook Integration** - Push alerts to external systems
6. **SIEM Integration** - Splunk, ELK Stack support
7. **Advanced Analytics** - ML-based anomaly detection
8. **Session Management** - Advanced session controls
9. **API Key Management** - Service accounts
10. **Certificate Pinning** - Enhanced HTTPS security

## Support & Documentation

For questions or issues:

1. Check logs: `backend/logs/` and `backend/logs/audit/`
2. Review SECURITY.md for baseline security
3. See SECURITY-EXPLAINED.md for detailed explanations
4. Contact security team for critical issues

## Security Checklist

- [ ] JWT_SECRET is 32+ characters
- [ ] HTTPS enabled in production
- [ ] Audit logging enabled
- [ ] IP whitelist configured (if needed)
- [ ] Security monitoring active
- [ ] Regular security reviews scheduled
- [ ] Backup and recovery tested
- [ ] Incident response plan documented
- [ ] Security team trained on alerts
- [ ] Vulnerability scanning automated

---

**Last Updated:** October 10, 2025
**Version:** 2.0
**Security Level:** Enterprise
