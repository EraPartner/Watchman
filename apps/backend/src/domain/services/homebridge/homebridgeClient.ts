import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { UnauthorizedError, UnavailableError } from '../../../core/errors.js';

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
}

export function createHomebridgeClient(deps: HomebridgeClientDeps): HomebridgeClient {
  const baseUrl = deps.config.baseUrl.replace(/\/+$/, '');
  let bearer = deps.config.authToken || '';
  let cookie: string | null = null;

  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'watchman-homebridge-check/1.0',
    };
    if (bearer) h['authorization'] = `Bearer ${bearer}`;
    else if (cookie) h['cookie'] = cookie;
    return h;
  };

  const captureCookies = (res: HttpResponse): void => {
    const setCookie = res.headers['set-cookie'];
    if (!setCookie) return;
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
    const pairs = arr.map((c) => c.split(';')[0]).filter(Boolean) as string[];
    if (pairs.length > 0) cookie = pairs.join('; ');
  };

  const login = async (signal: AbortSignal): Promise<boolean> => {
    if (!deps.config.username || !deps.config.password) return false;
    const url = `${baseUrl}${deps.config.loginPath}`;
    const res = await deps.http.send({
      url,
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        username: deps.config.username,
        password: deps.config.password,
      }),
      signal,
      timeoutMs: deps.config.timeoutMs,
    });
    captureCookies(res);
    if (res.status < 200 || res.status >= 300) return false;
    const text = await res.text().catch(() => '');
    try {
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      const token = body?.['token'] ?? body?.['access_token'];
      if (typeof token === 'string' && token) bearer = token;
    } catch {
      // cookie-only auth acceptable
    }
    return true;
  };

  const attempt = async <T>(path: string, signal: AbortSignal): Promise<T> => {
    const url = path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
    const res = await deps.http.send({
      url,
      method: 'GET',
      headers: buildHeaders(),
      signal,
      timeoutMs: deps.config.timeoutMs,
    });
    captureCookies(res);
    const ct = String(res.headers['content-type'] ?? '');
    const text = await res.text().catch(() => '');
    if (ct.includes('text/html') || /<html/i.test(text)) {
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
      try {
        return await attempt<T>(path, signal);
      } catch (e) {
        if (e instanceof UnauthorizedError && deps.config.username && deps.config.password) {
          const ok = await login(signal);
          if (ok) return await attempt<T>(path, signal);
        }
        throw e;
      }
    },
  };
}
