/**
 * Backend Service Utilities
 *
 * Shared utility functions for backend services.
 * Centralizes common formatting and helper functions to follow DRY principle.
 */

import net from "net";
import { logger } from "../middleware/logger.js";

/**
 * Format bytes to human-readable format
 * @param {number|null|undefined} bytes - Bytes to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted bytes string
 */
export function formatBytes(bytes, decimals = 1) {
  if (bytes === null || bytes === undefined) return "N/A";
  if (!Number.isFinite(bytes) || bytes === 0) return "0 B";
  const b = Math.max(0, bytes);
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((b / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format bytes per second to speed string
 * @param {number|null|undefined} bytesPerSecond - Bytes per second
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted speed string
 */
export function formatSpeed(bytesPerSecond, decimals = 1) {
  return `${formatBytes(bytesPerSecond, decimals)}/s`;
}

/**
 * Format seconds to uptime string (days/hours/minutes)
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted uptime string
 */
export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format milliseconds to duration string (days/hours/minutes/seconds)
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format milliseconds to human-readable time
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time string
 */
export function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Parse environment variable as boolean
 * @param {string} value - Environment variable value
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Parsed boolean
 */
export function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Parse environment variable as integer
 * @param {string} value - Environment variable value
 * @param {number} defaultValue - Default value
 * @returns {number} Parsed integer
 */
export function parseIntEnv(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get required environment variable or throw
 * @param {string} name - Environment variable name
 * @returns {string} Variable value
 * @throws {Error} If variable is not set
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 * @param {string} name - Environment variable name
 * @param {*} defaultValue - Default value
 * @returns {*} Variable value or default
 */
export function optionalEnv(name, defaultValue) {
  return process.env[name] || defaultValue;
}

/**
 * Create timeout controller
 * @param {number} timeout - Timeout in milliseconds
 * @returns {{controller: AbortController, timeoutId: number}}
 */
export function createTimeout(timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return { controller, timeoutId };
}

/**
 * Clear timeout
 * @param {number} timeoutId - Timeout ID from setTimeout
 */
export function clearTimeoutSafe(timeoutId) {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
}

/**
 * Safely execute async function with timeout
 * @param {Function} fn - Async function to execute
 * @param {number} timeout - Timeout in milliseconds
 * @param {string} errorMessage - Error message on timeout
 * @returns {Promise<*>} Function result
 */
export async function withTimeout(
  fn,
  timeout,
  errorMessage = "Operation timed out"
) {
  const { controller, timeoutId } = createTimeout(timeout);
  try {
    return await fn(controller.signal);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(errorMessage);
    }
    throw error;
  } finally {
    clearTimeoutSafe(timeoutId);
  }
}

/**
 * Retry async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<*>} Function result
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    onRetry = null,
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        if (onRetry) {
          onRetry(attempt, error, delay);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= backoffMultiplier;
      }
    }
  }

  throw lastError;
}

/**
 * Default service configuration
 */
export const defaultTimeouts = {
  short: 3000,
  medium: 10000,
  long: 30000,
  bitcoin: 120000,
};

/**
 * Default keep-alive settings
 */
export const keepAliveDefaults = {
  msecs: 30000,
  maxSockets: 25,
};

/**
 * Parse Set-Cookie header value
 * @param {string} setCookieHeader - Value of Set-Cookie header
 * @returns {string[]} Array of cookie strings
 */
export function parseSetCookieHeader(setCookieHeader) {
  if (!setCookieHeader) return [];
  return setCookieHeader
    .split(/,\s*(?=[^ ;]+=)/)
    .map((c) => String(c).split(";")[0]);
}

/**
 * Parse cookies from raw headers (handles different header formats)
 * @param {Object} headers - Response headers
 * @returns {string[]} Array of cookie strings
 */
export function parseResponseCookies(headers) {
  let cookies = [];

  // Handle function-style headers (node-fetch)
  if (typeof headers.raw === "function") {
    const raw = headers.raw();
    if (raw && raw["set-cookie"]) {
      cookies = raw["set-cookie"];
    }
  } else {
    // Handle standard Headers object
    const setCookie = headers.get("set-cookie") || headers.get("Set-Cookie");
    if (setCookie) {
      cookies = parseSetCookieHeader(setCookie);
    }
  }

  return cookies;
}

/**
 * Ping a host to check connectivity
 * @param {string} host - Hostname or IP
 * @param {Object} options - Ping options
 * @returns {Promise<{success: boolean, time?: number, error?: string}>}
 */
export async function pingHost(host, options = {}) {
  const { timeout = 3000 } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on("connect", () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ success: true, time: responseTime });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ success: false, error: "Connection timed out" });
    });

    socket.on("error", (error) => {
      socket.destroy();
      resolve({ success: false, error: error.message });
    });

    // Try port 80 first (HTTP)
    let port = options.port || 80;
    let targetHost = host;

    // Check if host includes port
    if (host.includes(":")) {
      const parts = host.split(":");
      targetHost = parts[0];
      port = parseInt(parts[1], 10) || port;
    }

    socket.connect(port, targetHost);
  });
}

/**
 * Execute shell ping command and parse results
 * @param {string} host - Host to ping
 * @param {Object} options - Ping options
 * @returns {Promise<{success: boolean, stdout?: string, stderr?: string}>}
 */
export async function execPingHost(host, options = {}) {
  const { timeout = 5000, pingCount = 2 } = options;
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // Try multiple strategies to handle IPv4/IPv6/platform variance
  const attempts = [
    `ping -c ${pingCount} -4 ${host}`, // Force IPv4
    `ping -c ${pingCount} ${host}`, // Generic
    `ping6 -c ${pingCount} ${host}`, // IPv6
  ];

  let combinedStdout = "";
  let combinedStderr = "";

  for (const cmd of attempts) {
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: timeout + 1500,
      });
      combinedStdout += `\n--- cmd: ${cmd} ---\n` + (stdout || "");
      combinedStderr += `\n--- cmd: ${cmd} ---\n` + (stderr || "");

      const out = stdout || "";
      const success =
        /0% packet loss|0\.0% packet loss|0 packets lost|0 received/.test(
          out
        ) && !/100% packet loss/.test(out);

      if (success) {
        return {
          success: true,
          stdout: combinedStdout,
          stderr: combinedStderr,
        };
      }
    } catch (err) {
      const stdout = err.stdout || "";
      const stderr = err.stderr || err.message || "";
      combinedStdout += `\n--- cmd error: ${cmd} ---\n` + stdout;
      combinedStderr += `\n--- cmd error: ${cmd} ---\n` + stderr;
    }
  }

  if (!combinedStdout && !combinedStderr) {
    combinedStderr =
      "No ping output captured; ping may be unavailable or blocked";
  }

  return { success: false, stdout: combinedStdout, stderr: combinedStderr };
}
