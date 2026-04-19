import { APP_CONFIG } from "../../lib/constants";
import { csrfManager } from "../../lib/csrf";
import { getBackendUrl } from "../../lib/backendUrl";
import { extractApiError, unwrapApiResponse } from "../../lib/apiResponse";
import type { ApiRequestOptions } from "./types";

const backendUrl = getBackendUrl();

export class ApiClientCore {
  private baseUrl: string;
  private authToken: string | null = null;
  private inFlightRequests: Map<string, Promise<unknown>> = new Map();

  constructor() {
    this.baseUrl = backendUrl;
  }

  public setFallbackAuthToken(token: string | null) {
    this.authToken = token;
  }

  public extractCompatibilityAuthToken(response: unknown): string | undefined {
    if (!response || typeof response !== "object" || !("token" in response)) {
      return undefined;
    }

    const token = (response as { token?: unknown }).token;
    if (typeof token !== "string" || token.length === 0) {
      return undefined;
    }

    return token;
  }

  public async request<T>(
    endpoint: string,
    options?: ApiRequestOptions,
    customTimeout?: number
  ): Promise<T> {
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 500;
    const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];
    const method = (options?.method || "GET").toUpperCase();
    const shouldRetryMethod = method === "GET" || method === "HEAD";

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.fetchWithDedup<T>(endpoint, options, customTimeout);
      } catch (error) {
        lastError = error;

        const status =
          typeof error === "object" && error !== null && "status" in error
            ? Number((error as { status?: unknown }).status)
            : undefined;

        const name =
          typeof error === "object" && error !== null && "name" in error
            ? String((error as { name?: unknown }).name)
            : undefined;

        const isRetryable =
          shouldRetryMethod &&
          ((status !== undefined && RETRYABLE_STATUSES.includes(status)) ||
            name === "AbortError" ||
            (error instanceof TypeError && error.message?.includes("fetch")));

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw error;
        }

        const delayMs =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError || new Error("Unknown error after retries");
  }

  private makeRequestKey(url: string, options?: ApiRequestOptions) {
    const method =
      options && options.method ? String(options.method).toUpperCase() : "GET";
    let bodyKey = "";
    try {
      if (options && options.body != null) {
        bodyKey =
          typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
      }
    } catch {
      bodyKey = String(options?.body);
    }
    return `${method} ${url} ${bodyKey}`;
  }

  private normalizeHeaders(headers?: unknown): Record<string, string> {
    const normalized: Record<string, string> = {};

    if (!headers) {
      return normalized;
    }

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        normalized[key] = value;
      });
      return normalized;
    }

    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [key, value] = entry;
        normalized[String(key)] = String(value);
      }
      return normalized;
    }

    if (typeof headers === "object" && headers !== null) {
      for (const [key, value] of Object.entries(
        headers as Record<string, unknown>
      )) {
        if (value !== undefined) {
          normalized[key] = String(value);
        }
      }
    }

    return normalized;
  }

  private hasHeader(
    headers: Record<string, string>,
    headerName: string
  ): boolean {
    const target = headerName.toLowerCase();
    return Object.keys(headers).some((key) => key.toLowerCase() === target);
  }

  private async fetchWithDedup<T>(
    endpoint: string,
    options?: ApiRequestOptions,
    customTimeout?: number
  ): Promise<T> {
    const url = this.baseUrl ? `${this.baseUrl}${endpoint}` : endpoint;

    const key = this.makeRequestKey(url, options);
    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    const timeoutMs = customTimeout || APP_CONFIG.API_TIMEOUT || 10000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const callerSignal =
      options?.signal instanceof AbortSignal ? options.signal : undefined;
    const signal = callerSignal
      ? AbortSignal.any([timeoutSignal, callerSignal])
      : timeoutSignal;

    const method = (options?.method || "GET").toUpperCase();
    const headers = this.normalizeHeaders(options?.headers);

    if (
      method !== "GET" &&
      method !== "HEAD" &&
      !this.hasHeader(headers, "content-type")
    ) {
      headers["Content-Type"] = "application/json";
    }

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      csrfManager.addTokenToHeaders(headers);
    }

    if (this.authToken && !this.hasHeader(headers, "authorization")) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    const fetchOptions = Object.assign({}, options, {
      headers,
      credentials: "include",
      signal,
    });

    const promise = (async () => {
      try {
        const response = await fetch(url, fetchOptions);

        const responseBody = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));

        if (!response.ok) {
          const error = new Error(
            extractApiError(
              responseBody,
              `API request failed: ${response.status} ${response.statusText}`
            )
          );
          (error as Error & { status?: number }).status = response.status;
          throw error;
        }

        return unwrapApiResponse<T>(responseBody);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          const timeoutError = new Error(
            `Network error: request to ${endpoint} timed out after ${timeoutMs}ms`
          );
          (timeoutError as Error & { name: string }).name = "AbortError";
          throw timeoutError;
        }

        if (
          error instanceof TypeError &&
          error.message &&
          error.message.includes("fetch")
        ) {
          throw new Error(
            `Network error: Cannot connect to backend at ${this.baseUrl}. Please check if the backend is running.`
          );
        }

        throw error;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }
}
