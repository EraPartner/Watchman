/**
 * Circuit Breaker Pattern Implementation
 *
 * Provides fault tolerance for external service calls by tracking failures
 * and temporarily blocking requests to failing services.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests are blocked
 * - HALF-OPEN: Testing if service recovered
 *
 * @fileoverview Circuit breaker for external service calls
 * @author Watchman Team
 * @version 1.0.0
 */

import logger from "./logger.js";

/**
 * Circuit Breaker states
 */
export const CircuitState = {
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half-open",
};

/**
 * Circuit Breaker class
 */
export class CircuitBreaker {
  /**
   * @param {Object} options - Configuration options
   * @param {number} options.failureThreshold - Number of failures before opening (default: 5)
   * @param {number} options.successThreshold - Successes needed to close from half-open (default: 3)
   * @param {number} options.timeout - Time in ms before trying half-open (default: 30000)
   * @param {number} options.monitorWindow - Time window to track failures (default: 60000)
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 3;
    this.timeout = options.timeout || 30000;
    this.monitorWindow = options.monitorWindow || 60000;

    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.successes = 0;
    this.lastFailureTime = null;
    this.name = options.name || "unknown";
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} Result of the function
   */
  async execute(fn) {
    if (this.state === CircuitState.OPEN) {
      // Check if it's time to try half-open
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
        logger.info(`Circuit breaker '${this.name}' entering half-open state`);
      } else {
        throw new Error(`Circuit breaker '${this.name}' is open`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  onSuccess() {
    this.failures = []; // Clear failure history on success

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        logger.info(
          `Circuit breaker '${this.name}' closed after successful recovery`
        );
      }
    }
  }

  /**
   * Record a failed call
   */
  onFailure() {
    this.lastFailureTime = Date.now();
    this.failures.push(this.lastFailureTime);

    // Clean old failures outside the window
    const cutoff = Date.now() - this.monitorWindow;
    this.failures = this.failures.filter((t) => t > cutoff);

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      logger.warn(
        `Circuit breaker '${this.name}' re-opened after half-open failure`
      );
    } else if (this.failures.length >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.warn(
        `Circuit breaker '${this.name}' opened after ${this.failures.length} failures`
      );
    }
  }

  /**
   * Get current state
   * @returns {Object} State information
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures.length,
      lastFailure: this.lastFailureTime,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.successes = 0;
    this.lastFailureTime = null;
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different services
 */
export class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker for a service
   * @param {string} name - Service name
   * @param {Object} options - Circuit breaker options
   * @returns {CircuitBreaker}
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ name, ...options }));
    }
    return this.breakers.get(name);
  }

  /**
   * Execute with circuit breaker protection
   * @param {string} serviceName - Service identifier
   * @param {Function} fn - Function to execute
   * @param {Object} options - Circuit breaker options
   * @returns {Promise<any>}
   */
  async execute(serviceName, fn, options = {}) {
    const breaker = this.getBreaker(serviceName, options);
    return breaker.execute(fn);
  }

  /**
   * Get status of all circuit breakers
   * @returns {Object[]} Array of circuit breaker states
   */
  getAllStates() {
    return Array.from(this.breakers.values()).map((b) => b.getState());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    this.breakers.forEach((breaker) => breaker.reset());
  }
}

// Export singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();
export default circuitBreakerManager;
