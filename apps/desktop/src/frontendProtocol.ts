import { protocol, net } from "electron";
import * as path from "path";
import { pathToFileURL } from "url";

const SCHEME = "watchman";

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
      return await net.fetch(pathToFileURL(resolved).toString());
    } catch {
      const fallback = path.join(frontendRoot, "index.html");
      return net.fetch(pathToFileURL(fallback).toString());
    }
  });
}

export const FRONTEND_SCHEME = SCHEME;
export const FRONTEND_ENTRY_URL = `${SCHEME}://app/`;
