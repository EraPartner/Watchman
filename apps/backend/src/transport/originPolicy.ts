export type OriginPredicate = (origin: string | undefined) => boolean;

const DEFAULT_PREFIXES = [
  "watchman://",
  "http://localhost:",
  "http://127.0.0.1:",
] as const;

export function parseOriginList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Shared origin allow-list for HTTP CORS and the WebSocket upgrade gate.
 * Desktop (watchman://) and loopback dev origins are always allowed; extra
 * origins (e.g. a LAN/web deployment) come from CORS_ALLOWED_ORIGINS.
 * Requests without an Origin header (non-browser clients) are allowed —
 * the deployment model is a trusted network, the gate exists to stop
 * cross-site browser requests.
 */
export function createOriginPolicy(
  extraOrigins: readonly string[] = []
): OriginPredicate {
  const exact = new Set<string>();
  for (const raw of extraOrigins) {
    try {
      exact.add(new URL(raw).origin);
    } catch {
      exact.add(raw);
    }
  }
  return (origin) => {
    if (origin === undefined || origin === "") return true;
    if (DEFAULT_PREFIXES.some((p) => origin.startsWith(p))) return true;
    try {
      return exact.has(new URL(origin).origin);
    } catch {
      return false;
    }
  };
}
