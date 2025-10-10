// Account lockout mechanism to prevent brute force attacks
import logger from "./logger.js";

class AccountLockoutManager {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 5;
    this.lockoutDuration = options.lockoutDuration || 15 * 60 * 1000; // 15 minutes
    this.cleanupInterval = options.cleanupInterval || 60 * 1000; // 1 minute

    // Store failed attempts: Map<username, { count, firstAttempt, lockedUntil }>
    this.attempts = new Map();

    // Periodic cleanup of old entries
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * Record a failed login attempt
   * @param {string} username - Username that failed login
   * @param {string} ip - IP address of the attempt
   * @returns {Object} { locked: boolean, attemptsRemaining: number, lockedUntil: Date|null }
   */
  recordFailedAttempt(username, ip) {
    const key = this.getKey(username, ip);
    const now = Date.now();

    let record = this.attempts.get(key);

    if (!record) {
      record = {
        count: 1,
        firstAttempt: now,
        lockedUntil: null,
      };
    } else {
      record.count++;
    }

    // Check if account should be locked
    if (record.count >= this.maxAttempts) {
      record.lockedUntil = now + this.lockoutDuration;

      logger.warn("Account locked due to failed login attempts", {
        username,
        ip,
        attempts: record.count,
        lockedUntil: new Date(record.lockedUntil).toISOString(),
      });
    }

    this.attempts.set(key, record);

    return {
      locked: record.lockedUntil && record.lockedUntil > now,
      attemptsRemaining: Math.max(0, this.maxAttempts - record.count),
      lockedUntil: record.lockedUntil ? new Date(record.lockedUntil) : null,
    };
  }

  /**
   * Check if an account is currently locked
   * @param {string} username - Username to check
   * @param {string} ip - IP address to check
   * @returns {Object} { locked: boolean, lockedUntil: Date|null }
   */
  isLocked(username, ip) {
    const key = this.getKey(username, ip);
    const record = this.attempts.get(key);
    const now = Date.now();

    if (!record || !record.lockedUntil) {
      return { locked: false, lockedUntil: null };
    }

    if (record.lockedUntil <= now) {
      // Lock expired, clean up
      this.attempts.delete(key);
      return { locked: false, lockedUntil: null };
    }

    return {
      locked: true,
      lockedUntil: new Date(record.lockedUntil),
    };
  }

  /**
   * Reset failed attempts for a user (call on successful login)
   * @param {string} username - Username to reset
   * @param {string} ip - IP address to reset
   */
  resetAttempts(username, ip) {
    const key = this.getKey(username, ip);
    this.attempts.delete(key);
  }

  /**
   * Get a unique key for tracking attempts
   * @param {string} username - Username
   * @param {string} ip - IP address
   * @returns {string} Unique key
   */
  getKey(username, ip) {
    // Combine username and IP for tracking
    // This prevents one IP from locking all accounts
    // and one user from being locked across all IPs
    return `${username}:${ip}`;
  }

  /**
   * Clean up expired lockouts and old attempts
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, record] of this.attempts.entries()) {
      // Remove entries where:
      // 1. Lock has expired, or
      // 2. First attempt was more than 1 hour ago (to prevent memory leak)
      if (
        (record.lockedUntil && record.lockedUntil <= now) ||
        now - record.firstAttempt > 60 * 60 * 1000
      ) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.attempts.delete(key));

    if (expiredKeys.length > 0) {
      logger.debug(`Cleaned up ${expiredKeys.length} expired lockout records`);
    }
  }

  /**
   * Get statistics about current lockouts
   * @returns {Object} Statistics
   */
  getStats() {
    const now = Date.now();
    let locked = 0;
    let failed = 0;

    for (const record of this.attempts.values()) {
      if (record.lockedUntil && record.lockedUntil > now) {
        locked++;
      } else {
        failed++;
      }
    }

    return {
      totalTracked: this.attempts.size,
      locked,
      failed,
    };
  }

  /**
   * Shutdown cleanup timer
   */
  shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// Singleton instance
const lockoutManager = new AccountLockoutManager({
  maxAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000,
});

/**
 * Express middleware to check for account lockout
 */
export function checkLockout(req, res, next) {
  const username = req.body?.username;
  const ip = req.ip || req.connection.remoteAddress;

  if (!username) {
    return next();
  }

  const status = lockoutManager.isLocked(username, ip);

  if (status.locked) {
    logger.warn("Login attempt on locked account", {
      username,
      ip,
      lockedUntil: status.lockedUntil.toISOString(),
    });

    return res.status(429).json({
      error: "Account temporarily locked due to too many failed login attempts",
      lockedUntil: status.lockedUntil.toISOString(),
      message: "Please try again later",
    });
  }

  next();
}

/**
 * Record failed login attempt
 */
export function recordFailedLogin(username, ip) {
  return lockoutManager.recordFailedAttempt(username, ip);
}

/**
 * Reset attempts on successful login
 */
export function resetLoginAttempts(username, ip) {
  lockoutManager.resetAttempts(username, ip);
}

export { lockoutManager };
export default lockoutManager;
