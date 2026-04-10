/**
 * IP utilities
 *
 * Normalizes request/client IP values so security middleware (IP control,
 * lockout, rate limiting) can operate on a consistent canonical format.
 */

const LOCALHOST_IPS = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Normalize an IP string to a stable canonical value.
 *
 * Examples:
 * - ::ffff:127.0.0.1 -> 127.0.0.1
 * - ::ffff:192.168.1.10 -> 192.168.1.10
 * - " 127.0.0.1 " -> 127.0.0.1
 *
 * @param {unknown} rawIp
 * @returns {string}
 */
export function normalizeIp(rawIp) {
  const ip = typeof rawIp === "string" ? rawIp.trim() : "";
  if (!ip) {
    return "unknown";
  }

  // IPv4-mapped IPv6 format
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }

  return ip;
}

/**
 * Extract and normalize the request IP from Express request metadata.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export function getRequestIp(req) {
  const rawIp =
    req?.ip || req?.connection?.remoteAddress || req?.socket?.remoteAddress;
  return normalizeIp(rawIp);
}

/**
 * Check if an IP represents localhost.
 *
 * @param {unknown} rawIp
 * @returns {boolean}
 */
export function isLocalhostIp(rawIp) {
  const ip = normalizeIp(rawIp);
  return LOCALHOST_IPS.has(ip);
}
