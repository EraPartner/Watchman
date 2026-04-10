/**
 * CSRF token management for frontend
 * Implements double-submit cookie pattern as required by backend
 */

import { logger } from "./logger";

const DEFAULT_CSRF_COOKIE_NAME = "csrfToken";
const DEFAULT_CSRF_HEADER_NAME = "x-csrf-token";

type CsrfConfig = {
  cookieName: string;
  headerName: string;
};

export class CSRFManager {
  private static instance: CSRFManager;
  private config: CsrfConfig = {
    cookieName: DEFAULT_CSRF_COOKIE_NAME,
    headerName: DEFAULT_CSRF_HEADER_NAME,
  };

  private constructor() {}

  public static getInstance(): CSRFManager {
    if (!CSRFManager.instance) {
      CSRFManager.instance = new CSRFManager();
    }
    return CSRFManager.instance;
  }

  /**
   * Override CSRF cookie/header names from backend config.
   */
  public configure(config?: Partial<CsrfConfig>): void {
    this.config = {
      cookieName:
        config?.cookieName?.trim() ||
        this.config.cookieName ||
        DEFAULT_CSRF_COOKIE_NAME,
      headerName:
        config?.headerName?.trim() ||
        this.config.headerName ||
        DEFAULT_CSRF_HEADER_NAME,
    };
  }

  public getConfig(): CsrfConfig {
    return { ...this.config };
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

      return cookies[this.config.cookieName] || null;
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
      headers[this.config.headerName] = token;
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
