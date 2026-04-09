/**
 * Normalize a URL-like value to origin form (protocol + host + port).
 *
 * @param {unknown} value - URL-like input
 * @returns {string|undefined} Normalized origin or undefined when invalid
 */
export function normalizeOrigin(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).origin;
  } catch (_error) {
    return undefined;
  }
}

/**
 * Build an origin allowlist from a comma/space-delimited string or array.
 *
 * @param {string|string[]|unknown} input - Origin source(s)
 * @returns {Set<string>} Normalized origin allowlist
 */
export function buildAllowedOriginSet(input) {
  const origins = new Set();
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[ ,]+/)
      : [];

  for (const entry of values) {
    const normalized = normalizeOrigin(entry);
    if (normalized) {
      origins.add(normalized);
    }
  }

  return origins;
}
