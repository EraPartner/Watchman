import type { HttpClient, HttpRequest, HttpResponse } from '../../../infra/http/client.js';
import { createJwtClient } from '../../../infra/http/jwtClient.js';
import { UnauthorizedError, UnavailableError } from '../../../core/errors.js';
import { createAuthGate } from '../../../infra/http/authGate.js';

export interface HomebridgeClientConfig {
  baseUrl: string;
  username: string;
  password: string;
  authToken: string;
  loginPath: string;
  timeoutMs: number;
}

export interface HomebridgeClient {
  get<T>(path: string, signal: AbortSignal): Promise<T>;
}

export interface HomebridgeClientDeps {
  http: HttpClient;
  config: HomebridgeClientConfig;
  /** Clock for the login backoff (default Date.now). */
  now?: () => number;
}

export function createHomebridgeClient(deps: HomebridgeClientDeps): HomebridgeClient {
  const baseUrl = deps.config.baseUrl.replace(/\/+$/, '');
  let cookie: string | null = null;
  // Every 401 used to trigger a fresh login, so a wrong password meant a
  // failed login every few seconds forever. The gate waits after the first
  // refused login and stops after the second until the config is saved.
  const authGate = createAuthGate({ now: deps.now ?? Date.now, label: 'homebridge' });

  const captureCookies = (res: HttpResponse): void => {
    const setCookie = res.headers['set-cookie'];
    if (!setCookie) return;
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
    const pairs = arr.map((c) => c.split(';')[0]).filter(Boolean) as string[];
    if (pairs.length > 0) cookie = pairs.join('; ');
  };

  /**
   * innerHttp: wraps deps.http to inject the current cookie header dynamically
   * and capture cookies from every response. This ensures that:
   * - Cookie auth works even when createJwtClient retries the original request
   * - Cookie state is updated after every response (login, retry, etc.)
   */
  const innerHttp: HttpClient = {
    async send(req: HttpRequest): Promise<HttpResponse> {
      const headers: Record<string, string> = { ...req.headers };
      // Inject cookie only when no Bearer token present (avoids header collision)
      if (!headers['authorization'] && cookie) {
        headers['cookie'] = cookie;
      }
      const enriched: HttpRequest = { ...req, headers };
      const res = await deps.http.send(enriched);
      captureCookies(res);
      return res;
    },
  };

  /**
   * loginFn: called by createJwtClient on 401. Performs credential-based login,
   * captures cookies as a side effect, and returns the JWT token.
   * Throws UnauthorizedError when credentials are absent or login fails.
   */
  const loginFn = async (): Promise<string> => {
    if (!deps.config.username || !deps.config.password) {
      throw new UnauthorizedError('homebridge credentials not configured');
    }
    authGate.check();
    const url = `${baseUrl}${deps.config.loginPath}`;
    const res = await deps.http.send({
      url,
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        username: deps.config.username,
        password: deps.config.password,
      }),
      timeoutMs: deps.config.timeoutMs,
    });
    captureCookies(res);
    if (res.status < 200 || res.status >= 300) {
      await res.text().catch(() => '');
      const error = new UnauthorizedError(`homebridge login failed with status ${res.status}`);
      // 5xx is the server failing, not the password being refused
      if (res.status < 500) authGate.reject(error);
      throw error;
    }
    authGate.accept();
    const text = await res.text().catch(() => '');
    try {
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      const token = body?.['token'] ?? body?.['access_token'];
      if (typeof token === 'string' && token) return token;
    } catch {
      // parse error — fall through to cookie-only
    }
    // Cookie-only auth: login set the cookie but no JWT token was returned.
    // Return empty string — createJwtClient will skip Bearer injection (falsy token),
    // and innerHttp will inject the captured cookie on the retry.
    return '';
  };

  const jwtHttp = createJwtClient(innerHttp, {
    refresh: loginFn,
    ...(deps.config.authToken ? { initialToken: deps.config.authToken } : {}),
  });

  const attempt = async <T>(path: string, signal: AbortSignal): Promise<T> => {
    const url = path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
    const res = await jwtHttp.send({
      url,
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'watchman-homebridge-check/1.0',
      },
      signal,
      timeoutMs: deps.config.timeoutMs,
    });
    const ct = String(res.headers['content-type'] ?? '');
    const text = await res.text().catch(() => '');
    // Only an HTML page (the UI's login screen) means "not logged in"; a JSON
    // body that merely contains "<html" (e.g. a plugin description) is data.
    if (ct.includes('text/html') || (!ct.includes('json') && /^\s*<(!doctype\s+)?html/i.test(text))) {
      throw new UnauthorizedError('homebridge returned HTML login page');
    }
    if (res.status < 200 || res.status >= 300) {
      if (res.status === 401 || res.status === 403) {
        throw new UnauthorizedError(`homebridge ${path} returned ${res.status}`);
      }
      throw new UnavailableError(`homebridge ${path} returned ${res.status}`);
    }
    if (!text) return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  };

  return {
    async get<T>(path: string, signal: AbortSignal): Promise<T> {
      if (!baseUrl) throw new UnavailableError('homebridge baseUrl not configured');
      // while a refused login is being backed off, don't poll at all
      authGate.check();
      return attempt<T>(path, signal);
    },
  };
}
