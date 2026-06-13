import { protocol, net } from "electron";
import * as path from "path";
import { pathToFileURL } from "url";

const SCHEME = "watchman";

// CSP for the packaged frontend served over watchman://. The backend lives on a
// loopback HTTP/WS origin, so connect-src must allow it explicitly (the port is
// dynamic, hence the wildcard). Dev (Vite) loads from its own origin and is not
// affected by these headers. 'unsafe-inline' stays on style-src because
// Tailwind/inline styles are still in use; scripts are locked to 'self'.
const FRONTEND_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Content-Security-Policy", FRONTEND_CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function registerFrontendScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function handleFrontendProtocol(frontendRoot: string): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    let relative = decodeURIComponent(url.pathname);
    if (relative === "/" || relative === "") {
      relative = "/index.html";
    }

    const resolved = path.normalize(path.join(frontendRoot, relative));
    // require a path-separator boundary so siblings sharing the prefix
    // (e.g. ".../dist-evil" vs ".../dist") don't pass the check
    if (
      resolved !== frontendRoot &&
      !resolved.startsWith(frontendRoot + path.sep)
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      return withSecurityHeaders(
        await net.fetch(pathToFileURL(resolved).toString())
      );
    } catch {
      const fallback = path.join(frontendRoot, "index.html");
      return withSecurityHeaders(
        await net.fetch(pathToFileURL(fallback).toString())
      );
    }
  });
}

export const FRONTEND_SCHEME = SCHEME;
export const FRONTEND_ENTRY_URL = `${SCHEME}://app/`;
