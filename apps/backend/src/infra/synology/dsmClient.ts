import type { HttpClient } from '../http/client.js';
import { UnauthorizedError, UnavailableError } from '../../core/errors.js';

export interface DsmClientConfig {
  baseUrl: string;
  account: string;
  password: string;
  timeoutMs: number;
  /** Pre-existing session ID. Omit to perform login on first call. */
  initialSid?: string;
}

export interface DsmClientDeps {
  http: HttpClient;
  config: DsmClientConfig;
}

export interface DsmClient {
  call<T>(
    api: string,
    version: number,
    method: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<T>;
}

interface DsmEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code?: number };
}

/** DSM error codes that indicate the session has expired and re-login is needed. */
const AUTH_RETRY_CODES = new Set([105, 106, 107]);

/**
 * Minimal Synology DSM HTTP client.
 *
 * - Routes `SYNO.API.Auth` → `/webapi/auth.cgi`; all other APIs → `/webapi/entry.cgi`
 * - Injects `_sid=<sid>` as a query parameter on every non-auth request
 * - On auth error codes 105/106/107: re-logs in once, retries the original call
 * - Concurrent calls share a single pending login — no thundering herd
 */
export function createDsmClient(deps: DsmClientDeps): DsmClient {
  const { http, config } = deps;
  const base = config.baseUrl.replace(/\/+$/, '');
  let currentSid: string | undefined = config.initialSid;
  let pendingLogin: Promise<string> | null = null;

  async function performLogin(signal?: AbortSignal): Promise<string> {
    const params = new URLSearchParams({
      api: 'SYNO.API.Auth',
      version: '3',
      method: 'login',
      account: config.account,
      passwd: config.password,
      format: 'sid',
    });
    const url = `${base}/webapi/auth.cgi?${params}`;
    const res = await http.send({ url, method: 'GET', timeoutMs: config.timeoutMs, ...(signal ? { signal } : {}) });
    const env = await res.json<DsmEnvelope<{ sid: string }>>();
    if (!env.success || !env.data?.sid) {
      throw new UnauthorizedError(
        `synology dsm login failed: code ${env.error?.code ?? 'unknown'}`,
      );
    }
    return env.data.sid;
  }

  async function doLogin(signal?: AbortSignal): Promise<string> {
    if (!config.account || !config.password) {
      throw new UnauthorizedError('synology dsm credentials not configured');
    }
    if (!pendingLogin) {
      pendingLogin = performLogin(signal).then(
        (sid) => {
          currentSid = sid;
          pendingLogin = null;
          return sid;
        },
        (err: unknown) => {
          pendingLogin = null;
          throw err;
        },
      );
    }
    return pendingLogin;
  }

  async function callOnce<T>(
    api: string,
    version: number,
    method: string,
    params: Record<string, string>,
    sid: string,
    signal?: AbortSignal,
  ): Promise<DsmEnvelope<T>> {
    const qp = new URLSearchParams({ api, version: String(version), method, _sid: sid, ...params });
    const url = `${base}/webapi/entry.cgi?${qp}`;
    const res = await http.send({ url, method: 'GET', timeoutMs: config.timeoutMs, ...(signal ? { signal } : {}) });
    return res.json<DsmEnvelope<T>>();
  }

  return {
    async call<T>(
      api: string,
      version: number,
      method: string,
      params: Record<string, string> = {},
      signal?: AbortSignal,
    ): Promise<T> {
      if (!currentSid) {
        await doLogin(signal);
      }

      const env = await callOnce<T>(api, version, method, params, currentSid!, signal);
      if (env.success) return env.data as T;

      const code = env.error?.code ?? 0;

      if (AUTH_RETRY_CODES.has(code)) {
        currentSid = undefined;
        await doLogin(signal);
        const retried = await callOnce<T>(api, version, method, params, currentSid!, signal);
        if (retried.success) return retried.data as T;
        throw new UnavailableError(
          `synology dsm ${api}.${method} failed after re-login: code ${retried.error?.code ?? 'unknown'}`,
        );
      }

      throw new UnavailableError(`synology dsm ${api}.${method} error: code ${code}`);
    },
  };
}
