# Security Concepts Explained

## CSRF Protection in Watchman

### What is CSRF (Cross-Site Request Forgery)?

CSRF is an attack where a malicious website tricks your browser into making unwanted requests to another site where you're logged in. For example:

1. You're logged into your Watchman dashboard at `https://watchman.yourdomain.com`
2. You visit a malicious site `evil-site.com`
3. That site contains hidden JavaScript that tries to make API calls to your Watchman backend
4. Without CSRF protection, these calls would succeed using your login session

### How Watchman's CSRF Protection Works

Your Watchman implementation uses the **"Double Submit Cookie"** pattern:

```javascript
// 1. When you log in, server creates a random token
const token = crypto.randomBytes(32).toString("hex"); // e.g., "a1b2c3d4e5f6..."

// 2. Server sends token in TWO places:
// - As a cookie (browser handles automatically)
res.cookie("csrfToken", token, { httpOnly: false }); 
// - Client must read cookie and send in headers manually
```

```javascript
// 3. Frontend reads cookie and includes in API calls
const csrfToken = document.cookie.match(/csrfToken=([^;]+)/)?.[1];
fetch('/api/adguard/protection', {
  method: 'POST',
  headers: {
    'x-csrf-token': csrfToken  // Must match cookie value
  },
  body: JSON.stringify({ enabled: true })
});
```

```javascript
// 4. Server validates both values match
if (headerToken !== cookieToken) {
  return res.status(403).json({ error: "Invalid CSRF token" });
}
```

### Why This Protects You

- **Cookies**: Sent automatically by browser (even from malicious sites)
- **Headers**: Must be set manually by JavaScript
- **Same-Origin Policy**: Malicious sites can't read your cookies to get the token
- **Result**: Only your legitimate frontend can make authenticated API calls

### Why No "CSRF Secret" Is Needed

Unlike some implementations that use a shared secret to generate tokens, Watchman uses a simpler approach:
- Each token is completely random
- No shared secret to compromise
- Each session gets a unique token
- More secure than shared secret approaches

## Other Security Measures in Watchman

### JWT Authentication

**Purpose**: Securely identify users across requests

**How it works**:
```bash
# 1. Strong secret protects against token forgery
JWT_SECRET=your-32+-character-random-string

# 2. Server signs tokens with secret
const token = jwt.sign({ username }, JWT_SECRET);

# 3. Server verifies tokens with same secret
const decoded = jwt.verify(token, JWT_SECRET);
```

**Why 32+ characters**: Makes brute force attacks computationally infeasible

### Password Hashing with bcrypt

**Purpose**: Protect passwords even if database is compromised

**How it works**:
```bash
# 1. Generate hash (cost factor 12 = ~250ms)
const hash = bcrypt.hashSync('user_password', 12);

# 2. Store hash, never plaintext password
AUTH_PASSWORD_HASH=$2b$12$pPoKFbQc0YbLqfaq7HmO0.rCqa3Q9fjf80OgopZ.g4BYwxhIqx7.W

# 3. Verify by hashing input and comparing
const valid = bcrypt.compareSync('input_password', stored_hash);
```

**Why bcrypt**: 
- Automatically salted (prevents rainbow table attacks)
- Adaptive cost (can increase difficulty as computers get faster)
- Industry standard for password storage

### Rate Limiting

**Purpose**: Prevent brute force and DoS attacks

**Implementation**:
- **Auth endpoints**: 5 requests per minute per IP
- **API endpoints**: 100 requests per minute per IP
- **Health checks**: No limit (for monitoring)

### Security Headers (via Helmet)

**Purpose**: Protect against various web vulnerabilities

**Headers added**:
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing attacks
- `X-Frame-Options: DENY` - Prevents clickjacking
- `Strict-Transport-Security` - Enforces HTTPS
- `Content-Security-Policy` - Prevents XSS attacks

### CORS Protection

**Purpose**: Control which domains can access your API

**Configuration**:
```javascript
cors({
  origin: process.env.FRONTEND_URL, // Only your frontend domain
  credentials: true  // Allow cookies/auth headers
})
```

**Why this matters**: Prevents other websites from making API calls to your backend

## Security Best Practices Implemented

### Environment Variable Security
- Never commit `.env.local` files to Git
- Use strong, unique secrets for each environment
- Separate secrets for different purposes (JWT, database, etc.)

### Network Security
- HTTPS enforcement in production
- Reverse proxy handles SSL termination
- Backend only accessible from proxy server

### Application Security
- Input validation on all endpoints
- Proper error handling (no information leakage)
- Graceful shutdown handling
- Health checks for monitoring

### Operational Security
- Log security events (failed logins, rate limits)
- Regular dependency updates
- Security audit scripts
- Incident response procedures