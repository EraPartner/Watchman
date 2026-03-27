/**
 * Structured Logging Middleware
 *
 * Provides comprehensive logging functionality with security-focused redaction,
 * request tracking, and structured output. Implements data sanitisation
 * to prevent sensitive information leakage in logs.
 *
 * @fileoverview Structured logging with security redaction
 * @author Watchman Team
 * @version 1.0.0
 */

import { join } from "path";

// Check if logging is enabled (default: true)
const LOG_ENABLED = process.env.LOG_ENABLED !== "false";
// Check if request logging is enabled (default: true, but respects LOG_ENABLED)
const LOG_REQUESTS = process.env.LOG_REQUESTS !== "false" && LOG_ENABLED;

/**
 * Structured Logger Class
 *
 * Provides secure, structured logging with automatic redaction of sensitive data.
 * Supports multiple log levels and formats output as JSON for easy parsing.
 */
class Logger {
  /**
   * Create a Logger instance
   *
   * @param {Object} options - Logger configuration options
   * @param {string} [options.level="info"] - Minimum log level
   * @param {string} [options.logFile] - Path to log file
   */
  constructor(options = {}) {
    this.enabled = LOG_ENABLED;
    this.level = options.level || process.env.LOG_LEVEL || "info";
    this.logFile = options.logFile || join(process.cwd(), "logs", "app.log");

    /**
     * Patterns for redacting sensitive information from logs
     * Covers passwords, tokens, secrets, authorization headers, and email addresses
     */
    this.redactPatterns = [
      /password[=:]\s*["']?([^"'\s]+)["']?/gi,
      /token[=:]\s*["']?([^"'\s]+)["']?/gi,
      /secret[=:]\s*["']?([^"'\s]+)["']?/gi,
      /authorization:\s*["']?([^"'\s]+)["']?/gi,
      /Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, // emails
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/gi, // Credit card numbers
      /\b\d{3}-\d{2}-\d{4}\b/gi, // SSN patterns
    ];

    /**
     * Log level hierarchy for filtering
     */
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  /**
   * Redact sensitive information from log messages
   *
   * @param {string} message - Raw log message
   * @returns {string} Redacted message with sensitive data masked
   * @private
   */
  redact(message) {
    if (typeof message !== "string") {
      message = String(message);
    }

    let redacted = message;
    this.redactPatterns.forEach((pattern) => {
      redacted = redacted.replace(pattern, (match, group) => {
        return match.replace(group, "[REDACTED]");
      });
    });
    return redacted;
  }

  /**
   * Format log entry as structured JSON
   *
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   * @returns {string} Formatted JSON log entry
   * @private
   */
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
    console.log(formatted);
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

  // Startup-specific logging methods for consistent formatting
  startup(message, meta = {}) {
    this.info(`[STARTUP] ${message}`, meta);
  }

  success(message, meta = {}) {
    this.info(`[SUCCESS] ${message}`, meta);
  }

  warning(message, meta = {}) {
    this.warn(`[WARNING] ${message}`, meta);
  }

  progress(message, meta = {}) {
    this.info(`[PROGRESS] ${message}`, meta);
  }

  service(serviceName, message, meta = {}) {
    // Service health/stats logs are high-frequency in hot paths.
    // Route them to debug level so they can be enabled when needed
    // (LOG_LEVEL=debug) without flooding default production logs.
    this.debug(`[SERVICE:${serviceName.toUpperCase()}] ${message}`, meta);
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

  // Log request (debug to reduce hot-path verbosity)
  logger.debug("Incoming request", {
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
      res.statusCode >= 500
        ? "error"
        : res.statusCode >= 400
          ? "warn"
          : "debug";

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
