// Renderer-initiated navigations the main window may follow. Everything else
// is bounced to the system browser (or dropped). Kept free of Electron imports
// so it can be unit-tested with node:test.
export interface NavigationPolicy {
  /** Origin of the local backend, e.g. "http://127.0.0.1:51234". */
  backendOrigin?: string;
  /** Origin of the Vite dev server in unpackaged dev runs. */
  devOrigin?: string;
}

export function isAllowedNavigation(
  url: string,
  policy: NavigationPolicy
): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (target.protocol === "watchman:") return true;
  // Exact origins only: any `file:` URL or any other loopback port would let
  // an in-app link take the window away from the app.
  return (
    (policy.backendOrigin !== undefined &&
      target.origin === policy.backendOrigin) ||
    (policy.devOrigin !== undefined && target.origin === policy.devOrigin)
  );
}

export function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { origin } = new URL(url);
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}
