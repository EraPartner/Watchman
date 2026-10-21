// Maps a watchman:// URL path to a path relative to the frontend root. Kept
// free of Electron imports so it can be unit-tested with node:test.
// Returns undefined for a path that can't be decoded (a stray "%"), which
// decodeURIComponent would otherwise throw on inside the protocol handler.
export function decodeRequestPath(pathname: string): string | undefined {
  let relative: string;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  return relative === "/" || relative === "" ? "/index.html" : relative;
}
