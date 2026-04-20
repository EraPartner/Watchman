/**
 * Backend URL Utility
 *
 * In the split deploy model, the Electron preload injects `apiUrl` / `wsUrl`
 * on `window.__WATCHMAN__` after the user enters the Pi backend URL in the
 * setup wizard. In dev (vite server), both are empty and requests go through
 * the vite proxy to `localhost:3001`.
 */

export interface DesktopBridge {
  apiUrl?: string;
  wsUrl?: string;
  isDesktop?: boolean;
  getApiUrl?: () => Promise<string>;
  saveApiUrl?: (url: string) => Promise<boolean>;
  reload?: () => Promise<boolean>;
}

export function getDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __WATCHMAN__?: DesktopBridge }).__WATCHMAN__;
}

/**
 * Return the backend HTTP base URL.
 * Empty string means "use relative URLs" (vite dev proxy).
 */
export function getBackendUrl(): string {
  return getDesktopBridge()?.apiUrl ?? "";
}

export function getWebSocketUrl(path = "/ws"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const desktopWsBase = getDesktopBridge()?.wsUrl;
  if (desktopWsBase) {
    try {
      const parsed = new URL(desktopWsBase);
      return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
    } catch {
      // fall through
    }
  }

  // Dev: vite proxies /ws to localhost:3001
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${normalizedPath}`;
  }

  return `ws://localhost:3001${normalizedPath}`;
}

export const API_TIMEOUT = 10000;

export const SERVICE_TIMEOUTS = {
  bitcoin: 120000,
  adguard: 5000,
  qbittorrent: 10000,
  default: 10000,
};
