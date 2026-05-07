export interface DesktopBridge {
  apiUrl?: string;
  wsUrl?: string;
  isDesktop?: boolean;
}

export function getDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __WATCHMAN__?: DesktopBridge }).__WATCHMAN__;
}

/**
 * Return the backend HTTP base URL.
 * - Desktop: injected by Electron preload via window.__WATCHMAN__.apiUrl
 * - Dev (vite server): "" so requests go through the vite proxy
 */
export function getBackendUrl(): string {
  const bridge = getDesktopBridge();
  if (bridge?.apiUrl) return bridge.apiUrl;
  return "";
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
