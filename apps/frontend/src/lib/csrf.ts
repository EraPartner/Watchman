/**
 * CSRF token management for frontend
 * Implements double-submit cookie pattern as required by backend
 */

import { logger } from "./logger";

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";

export class CSRFManager {
  private static instance: CSRFManager;

  private constructor() {}

  public static getInstance(): CSRFManager {
    if (!CSRFManager.instance) {
      CSRFManager.instance = new CSRFManager();
    }
    return CSRFManager.instance;
  }

  /**
   * Get CSRF token from cookie
   */
  public getToken(): string | null {
    if (typeof document === "undefined") return null;

    try {
      const cookies = document.cookie.split(";").reduce(
        (acc, cookie) => {
          const [key, value] = cookie.trim().split("=");
          acc[key] = value;
          return acc;
        },
        {} as Record<string, string>
      );

      return cookies[CSRF_COOKIE_NAME] || null;
    } catch (error) {
      logger.warn("[CSRF] Failed to read token from cookies", error);
      return null;
    }
  }

  /**
   * Add CSRF token to request headers
   */
  public addTokenToHeaders(
    headers: Record<string, string> = {}
  ): Record<string, string> {
    const token = this.getToken();
    if (token) {
      headers[CSRF_HEADER_NAME] = token;
    }
    return headers;
  }

  /**
   * Check if CSRF token is available
   */
  public hasToken(): boolean {
    return this.getToken() !== null;
  }
}

export const csrfManager = CSRFManager.getInstance();
