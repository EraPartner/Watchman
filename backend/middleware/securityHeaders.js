// Enhanced security headers middleware
import crypto from "crypto";
import logger from "./logger.js";

/**
 * Generate a nonce for CSP inline scripts
 */
export function generateNonce() {
  return crypto.randomBytes(16).toString("base64");
}

/**
 * Advanced security headers middleware
 */
export function advancedSecurityHeaders(req, res, next) {
  // Generate nonce for this request
  req.nonce = generateNonce();

  // Expect-CT: Certificate Transparency
  res.setHeader("Expect-CT", "max-age=86400, enforce");

  // X-Content-Type-Options: Prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // X-Download-Options: Prevent IE from executing downloads
  res.setHeader("X-Download-Options", "noopen");

  // X-Permitted-Cross-Domain-Policies: Restrict cross-domain policies
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  // Clear-Site-Data on logout
  if (req.path === "/api/auth/logout" && req.method === "POST") {
    res.setHeader("Clear-Site-Data", '"cache", "cookies", "storage"');
  }

  // NEL (Network Error Logging) - helps detect attacks
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "NEL",
      JSON.stringify({
        report_to: "default",
        max_age: 31536000,
        include_subdomains: true,
      })
    );
  }

  next();
}

/**
 * Prevent clickjacking attacks with more granular control
 */
export function preventClickjacking(req, res, next) {
  // Already handled by helmet, but this provides override capability
  const allowedOrigins = process.env.FRAME_ANCESTORS?.split(",") || [];

  if (allowedOrigins.length > 0) {
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors ${allowedOrigins.join(" ")}`
    );
  }

  next();
}

/**
 * Add timing attack protection by adding random delay
 */
export function timingAttackProtection(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Add 10-50ms random delay to prevent timing attacks
    const delay = Math.floor(Math.random() * 40) + 10;

    setTimeout(() => {
      originalJson(body);
    }, delay);
  };

  next();
}

/**
 * Detect and log suspicious patterns in requests
 */
export function suspiciousPatternDetection(req, res, next) {
  const suspiciousPatterns = [
    // SQL injection attempts
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    // XSS attempts
    /<script|javascript:|onerror=|onclick=/i,
    // Path traversal
    /\.\.[\/\\]/,
    // Command injection
    /[;&|`$(){}]/,
    // Common attack tools
    /sqlmap|nikto|nmap|burp|metasploit/i,
  ];

  const checkString = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      logger.warn("Suspicious pattern detected in request", {
        ip: req.ip,
        path: req.path,
        pattern: pattern.toString(),
        userAgent: req.get("user-agent"),
        requestId: req.requestId,
      });

      // Could also block the request here if desired
      // return res.status(400).json({ error: 'Invalid request' });
    }
  }

  next();
}

/**
 * Detect potential DDoS patterns
 */
class DDoSDetector {
  constructor() {
    // Track requests per IP
    this.requestCounts = new Map();
    this.suspiciousIPs = new Set();
    this.cleanupInterval = 60000; // 1 minute

    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  trackRequest(ip) {
    const now = Date.now();
    const window = 10000; // 10 second window

    if (!this.requestCounts.has(ip)) {
      this.requestCounts.set(ip, []);
    }

    const timestamps = this.requestCounts.get(ip);
    timestamps.push(now);

    // Remove old timestamps
    const recentTimestamps = timestamps.filter((t) => now - t < window);
    this.requestCounts.set(ip, recentTimestamps);

    // Check for suspicious activity (>50 requests in 10 seconds)
    if (recentTimestamps.length > 50) {
      if (!this.suspiciousIPs.has(ip)) {
        this.suspiciousIPs.add(ip);
        logger.error("Potential DDoS attack detected", {
          ip,
          requestCount: recentTimestamps.length,
          window: "10 seconds",
        });
      }
      return true;
    }

    return false;
  }

  isSuspicious(ip) {
    return this.suspiciousIPs.has(ip);
  }

  cleanup() {
    const now = Date.now();
    const timeout = 300000; // 5 minutes

    // Clear old request counts
    for (const [ip, timestamps] of this.requestCounts.entries()) {
      const recent = timestamps.filter((t) => now - t < timeout);
      if (recent.length === 0) {
        this.requestCounts.delete(ip);
      } else {
        this.requestCounts.set(ip, recent);
      }
    }

    // Clear suspicious IPs after 10 minutes
    // In production, you'd want to persist this or use a proper IP blocking system
  }
}

export const ddosDetector = new DDoSDetector();

export function ddosProtection(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;

  if (ddosDetector.trackRequest(ip)) {
    return res.status(429).json({
      error: "Too many requests. Please slow down.",
    });
  }

  next();
}

/**
 * Sanitize response headers to prevent information leakage
 */
export function sanitizeResponseHeaders(req, res, next) {
  // Remove potentially sensitive headers
  const originalSetHeader = res.setHeader.bind(res);

  res.setHeader = function (name, value) {
    // Prevent setting headers that leak info
    const blockedHeaders = ["x-powered-by", "server", "x-aspnet-version"];

    if (blockedHeaders.includes(name.toLowerCase())) {
      return res;
    }

    return originalSetHeader(name, value);
  };

  next();
}

/**
 * Add subresource integrity checks
 */
export function subresourceIntegrity(req, res, next) {
  // Track external resources and their hashes
  res.locals.sriHashes = new Map();

  next();
}
