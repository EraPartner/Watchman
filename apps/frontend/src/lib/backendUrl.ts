/**
 * Backend URL Utility
 *
 * Shared utility for detecting and returning the backend URL.
 * Centralizes URL detection logic that was duplicated in ApiClient and useServiceHealth.
 */

import { env } from "./env";

interface DesktopBridge {
  apiUrl?: string;
  wsUrl?: string;
  isDesktop?: boolean;
}

function getDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __WATCHMAN__?: DesktopBridge }).__WATCHMAN__;
}

/**
 * Get the backend URL
 * @returns {string} The backend URL
 */
export function getBackendUrl(): string {
  const desktopUrl = getDesktopBridge()?.apiUrl;
  if (desktopUrl) {
    return desktopUrl;
  }

  const envUrl = env.get("VITE_BACKEND_URL");

  // If explicitly set, use it
  if (envUrl) {
    return envUrl;
  }

  // In development mode, use relative URLs (Vite proxy will handle it)
  if (import.meta.env.DEV) {
    return "";
  }

  // In production, construct URL from current window location
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    // Use port 3001 for production backend
    return `${protocol}//${hostname}:3001`;
  }

  // Fallback
  return "http://localhost:3001";
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

  const envUrl = env.get("VITE_BACKEND_URL");
  const preferredProtocol =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss:"
      : "ws:";

  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      const protocol =
        preferredProtocol === "wss:" || parsed.protocol === "https:"
          ? "wss:"
          : "ws:";
      return `${protocol}//${parsed.host}${normalizedPath}`;
    } catch {
      // fall through to runtime-derived defaults
    }
  }

  if (typeof window !== "undefined") {
    const backendUrl = getBackendUrl();

    if (backendUrl) {
      try {
        const parsed = new URL(backendUrl);
        return `${preferredProtocol}//${parsed.host}${normalizedPath}`;
      } catch {
        // fall through
      }
    }

    return `${preferredProtocol}//${window.location.host}${normalizedPath}`;
  }

  return `ws://localhost:3001${normalizedPath}`;
}

/**
 * Default API timeout in milliseconds
 */
export const API_TIMEOUT = 10000;

/**
 * Service-specific timeouts
 */
export const SERVICE_TIMEOUTS = {
  bitcoin: 120000,
  adguard: 5000,
  qbittorrent: 10000,
  default: 10000,
};
