/**
 * Backend Service Utilities
 *
 * Shared utility functions for backend services.
 * Centralizes common formatting and helper functions to follow DRY principle.
 */

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
