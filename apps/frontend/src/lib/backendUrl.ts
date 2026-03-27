/**
 * Backend URL Utility
 *
 * Shared utility for detecting and returning the backend URL.
 * Centralizes URL detection logic that was duplicated in ApiClient and useServiceHealth.
 */

import { env } from "./env";

/**
 * Get the backend URL
 * @returns {string} The backend URL
 */
export function getBackendUrl(): string {
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
