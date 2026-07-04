export type OriginPredicate = (origin: string | undefined) => boolean;
export type HostPredicate = (host: string | undefined) => boolean;

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

function stripPort(host: string): string {
  // IPv6 literals are bracketed in a Host header: "[::1]:3001" / "[::1]".
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end >= 0 ? host.slice(1, end) : host;
  }
  const colon = host.indexOf(":");
  return colon >= 0 ? host.slice(0, colon) : host;
}

function isIpLiteral(name: string): boolean {
  if (name.includes(":")) return true; // IPv6
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(name); // IPv4
}

/**
 * Host-header allow-list guarding against DNS rebinding. A rebind serves the
 * attacker's page from their own domain and then repoints that name at this
 * backend's IP; the resulting requests are same-origin to the browser (so they
 * often carry no Origin header and the origin check can't stop them) but their
 * Host header is the attacker's domain. We accept only Hosts we recognise:
 *   - loopback names (localhost / 127.0.0.1 / ::1),
 *   - IP literals — a raw IP can't be DNS-rebound, and a cross-origin page that
 *     hardcodes this IP still carries a disallowed Origin (blocked there),
 *   - this machine's own hostname (+ its `.local` mDNS form), and
 *   - the hosts of any configured CORS_ALLOWED_ORIGINS.
 * A missing Host (HTTP/1.0 / non-browser client) is allowed — the model is a
 * trusted network and browsers always send Host. Access via some other internal
 * DNS name just needs that origin added to CORS_ALLOWED_ORIGINS.
 */
export function createHostPolicy(
  extraOrigins: readonly string[] = [],
  localHostname?: string
): HostPredicate {
  const allowed = new Set<string>(["localhost", "127.0.0.1", "::1"]);
  if (localHostname && localHostname.length > 0) {
    const h = localHostname.toLowerCase();
    allowed.add(h);
    if (!h.endsWith(".local")) allowed.add(`${h}.local`);
  }
  for (const raw of extraOrigins) {
    try {
      allowed.add(new URL(raw).hostname.toLowerCase());
    } catch {
      // ignore malformed entries
    }
  }
  return (host) => {
    if (host === undefined || host === "") return true;
    const name = stripPort(host).toLowerCase();
    return allowed.has(name) || isIpLiteral(name);
  };
}
