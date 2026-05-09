import type { QuickLinkContext } from "./types";

const STRING_FIELDS = new Set([
  "host",
  "hostname",
  "address",
  "ip",
  "url",
  "endpoint",
  "uiUrl",
  "webUiUrl",
]);

function pickString(
  cfg: Record<string, unknown> | undefined,
  keys: ReadonlyArray<string>
): string | undefined {
  if (!cfg) return undefined;
  for (const key of keys) {
    const v = cfg[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function pickNumber(
  cfg: Record<string, unknown> | undefined,
  keys: ReadonlyArray<string>
): number | undefined {
  if (!cfg) return undefined;
  for (const key of keys) {
    const v = cfg[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** Normalise an arbitrary user-supplied URL or host into an http(s) URL. */
function normalizeUrl(
  raw: string,
  fallbackPort?: number,
  forceScheme?: "http" | "https"
): string | undefined {
  if (!raw) return undefined;
  let candidate = raw.trim();
  if (!candidate) return undefined;
  // already a full URL
  if (/^[a-z]+:\/\//i.test(candidate)) {
    try {
      const u = new URL(candidate);
      // upgrade scheme if requested
      if (forceScheme && u.protocol.replace(":", "") !== forceScheme) {
        u.protocol = `${forceScheme}:`;
      }
      return u.toString().replace(/\/$/, "");
    } catch {
      return undefined;
    }
  }
  // bare host[:port]
  const scheme = forceScheme ?? "http";
  const hasPort = /:\d+$/.test(candidate);
  const url = hasPort
    ? `${scheme}://${candidate}`
    : fallbackPort
      ? `${scheme}://${candidate}:${fallbackPort}`
      : `${scheme}://${candidate}`;
  try {
    return new URL(url).toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export interface BuildOptions {
  /** Config keys to inspect for a host or URL. */
  hostKeys?: ReadonlyArray<string>;
  /** Config keys to inspect for a port. */
  portKeys?: ReadonlyArray<string>;
  /** Default port when none is configured. */
  defaultPort?: number;
  /** Force a specific scheme regardless of config. */
  scheme?: "http" | "https";
  /** Path appended to the resolved origin. */
  path?: string;
}

export function buildQuickLink(
  ctx: QuickLinkContext,
  opts: BuildOptions = {}
): string | undefined {
  const cfg = ctx.config;
  const host = pickString(cfg, [...(opts.hostKeys ?? []), ...STRING_FIELDS]);
  if (!host) return undefined;
  const port = pickNumber(cfg, opts.portKeys ?? ["port"]) ?? opts.defaultPort;
  const base = normalizeUrl(host, port, opts.scheme);
  if (!base) return undefined;
  if (!opts.path) return base;
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  return `${base}${path}`;
}
