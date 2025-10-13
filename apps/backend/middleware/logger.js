// Structured logging middleware with security-focused redaction
import { join } from "path";

// Check if logging is enabled (default: true)
const LOG_ENABLED = process.env.LOG_ENABLED !== "false";
// Check if request logging is enabled (default: true, but respects LOG_ENABLED)
const LOG_REQUESTS = process.env.LOG_REQUESTS !== "false" && LOG_ENABLED;

// Simple structured logger that redacts sensitive data
class Logger {
  constructor(options = {}) {
    this.enabled = LOG_ENABLED;
    this.level = options.level || process.env.LOG_LEVEL || "info";
    this.logFile = options.logFile || join(process.cwd(), "logs", "app.log");
    this.redactPatterns = [
      /password[=:]\s*["']?([^"'\s]+)["']?/gi,
      /token[=:]\s*["']?([^"'\s]+)["']?/gi,
      /secret[=:]\s*["']?([^"'\s]+)["']?/gi,
      /authorization:\s*["']?([^"'\s]+)["']?/gi,
      /Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, // emails
    ];
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  redact(message) {
    let redacted = String(message);
    this.redactPatterns.forEach((pattern) => {
      redacted = redacted.replace(pattern, (match, group) => {
        return match.replace(group, "[REDACTED]");
      });
    });
    return redacted;
  }

  format(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message: this.redact(message),
      ...(meta.requestId && { requestId: meta.requestId }),
      ...(meta.userId && { userId: meta.userId }),
      ...(meta.ip && { ip: meta.ip }),
      ...(meta.path && { path: meta.path }),
      ...(meta.method && { method: meta.method }),
      ...(meta.duration && { duration: meta.duration }),
      ...(meta.statusCode && { statusCode: meta.statusCode }),
    };

    // Remove any remaining sensitive data from meta
    if (meta.error && meta.error.stack) {
      logEntry.stack = this.redact(meta.error.stack);
    }

    return JSON.stringify(logEntry);
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  write(level, message, meta = {}) {
    if (!this.enabled || !this.shouldLog(level)) return;

    const formatted = this.format(level, message, meta);

    // Write to console in development
    if (process.env.NODE_ENV !== "production") {
      const colors = {
        error: "\x1b[31m",
        warn: "\x1b[33m",
        info: "\x1b[36m",
        debug: "\x1b[90m",
      };
      const reset = "\x1b[0m";
      console.log(`${colors[level] || ""}${formatted}${reset}`);
    } else {
      // In production, write to file/stdout
      console.log(formatted);
    }
  }

  error(message, meta = {}) {
    this.write("error", message, meta);
  }

  warn(message, meta = {}) {
    this.write("warn", message, meta);
  }

  info(message, meta = {}) {
    this.write("info", message, meta);
  }

  debug(message, meta = {}) {
    this.write("debug", message, meta);
  }
}

// Singleton instance
const logger = new Logger();

// Request ID middleware
export function requestIdMiddleware(req, res, next) {
  req.requestId =
    req.headers["x-request-id"] ||
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader("X-Request-ID", req.requestId);
  next();
}

// Request logging middleware
export function requestLogger(req, res, next) {
  // Skip logging if disabled
  if (!LOG_REQUESTS) {
    return next();
  }

  const startTime = Date.now();

  // Log request
  logger.info("Incoming request", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Log response
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger[level]("Request completed", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });

  next();
}

export { logger };
export default logger;
