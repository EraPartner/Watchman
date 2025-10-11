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
    // Use a combination of username and IP to track attempts
    // This helps prevent IP-based lockouts from affecting multiple users
    // and user-based lockouts from being bypassed by changing IP
    return `${username}:${ip}`;
  }

  /**
   * Cleanup old entries to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.attempts.entries()) {
      // Clean up if the lock has expired and there are no recent attempts
      const isLockExpired = record.lockedUntil && record.lockedUntil <= now;
      const isAttemptOld = now - record.firstAttempt > this.lockoutDuration * 2; // Arbitrary cleanup threshold

      if (isLockExpired || isAttemptOld) {
        this.attempts.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup timer
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

// Instantiate the manager
const accountLockoutManager = new AccountLockoutManager();

/**
 * Middleware to check if an account is locked
 */
export const checkLockout = (req, res, next) => {
  const { username } = req.body;
  const ip = req.ip;
  const { locked, lockedUntil } = accountLockoutManager.isLocked(username, ip);

  if (locked) {
    const minutesRemaining = Math.ceil((lockedUntil - Date.now()) / 60000);
    logger.warn("Blocked login attempt to locked account", { username, ip });
    return res.status(429).json({
      message: `Account locked. Please try again in ${minutesRemaining} minutes.`,
    });
  }

  next();
};

// Function to record a failed login
export const recordFailedLogin = async (username, ip) => {
  const result = accountLockoutManager.recordFailedAttempt(username, ip);
  if (result.locked) {
    logger.warn("Account has been locked", {
      username,
      ip,
      lockedUntil: result.lockedUntil.toISOString(),
    });
  }
};

// Function to reset login attempts on success
export const resetLoginAttempts = async (username, ip) => {
  accountLockoutManager.resetAttempts(username, ip);
};

export default accountLockoutManager;
