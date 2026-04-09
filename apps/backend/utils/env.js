/**
 * Environment parsing helpers for consistent config behavior.
 */

export function envString(name, defaultValue = undefined) {
  const value = process.env[name];
  if (typeof value !== "string") {
    return defaultValue;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
}

export function envInt(name, defaultValue = undefined) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Parse integer only when variable is present.
 *
 * Preserves legacy semantics for optional integer env vars:
 * - undefined/empty -> undefined
 * - invalid present value -> NaN
 */
export function envOptionalInt(name) {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

/**
 * Parse integer when variable is present, otherwise return fallback.
 *
 * Preserves common pattern:
 *   process.env.X ? parseInt(process.env.X) : fallback
 */
export function envPresentIntOr(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return Number.parseInt(value, 10);
}

export function envBool(name, defaultValue = undefined) {
  const value = process.env[name];
  if (typeof value !== "string") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return defaultValue;
}

export function envList(name, delimiterPattern = /[ ,]+/) {
  const value = envString(name, "");
  if (!value) {
    return [];
  }

  return value
    .split(delimiterPattern)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Parse Express trust proxy setting from environment.
 *
 * Supported values:
 * - "false" => false
 * - "true" => true
 * - integer string => number
 * - any other non-empty string => passthrough string
 * - undefined/empty => defaultValue
 */
export function envTrustProxy(name = "TRUST_PROXY", defaultValue = 1) {
  const value = process.env[name];
  if (typeof value !== "string") {
    return defaultValue;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return defaultValue;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === "false") {
    return false;
  }

  if (normalized === "true") {
    return true;
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return trimmed;
}
