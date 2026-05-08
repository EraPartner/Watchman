import type { HttpClient, HttpRequest, HttpResponse } from './client.js';

export interface JwtClientOptions {
  /** Token to use immediately. Omit for unauthenticated first request. */
  initialToken?: string;
  /** Called when a 401 is received. Must resolve with the new token. */
  refresh: () => Promise<string>;
}

/**
 * Wraps an HttpClient with automatic JWT injection and single-retry on 401.
 *
 * - Injects `Authorization: Bearer <token>` on every outgoing request.
 * - On 401: calls `refresh()` once, retries with the new token, then returns
 *   the retry response as-is (no second refresh even if that also 401s).
 * - Concurrent 401s share a single pending refresh promise — no thundering herd.
 */
export function createJwtClient(inner: HttpClient, opts: JwtClientOptions): HttpClient {
  let currentToken: string | undefined = opts.initialToken;
  let pendingRefresh: Promise<string> | null = null;

  function withBearer(req: HttpRequest): HttpRequest {
    if (!currentToken) return req;
    return {
      ...req,
      headers: {
        ...req.headers,
        authorization: `Bearer ${currentToken}`,
      },
    };
  }

  async function doRefresh(): Promise<string> {
    if (!pendingRefresh) {
      pendingRefresh = opts.refresh().then(
        (token) => {
          currentToken = token;
          pendingRefresh = null;
          return token;
        },
        (err) => {
          pendingRefresh = null;
          throw err;
        },
      );
    }
    return pendingRefresh;
  }

  return {
    async send(req: HttpRequest): Promise<HttpResponse> {
      const res = await inner.send(withBearer(req));
      if (res.status !== 401) return res;

      await doRefresh();

      return inner.send(withBearer(req));
    },
  };
}
