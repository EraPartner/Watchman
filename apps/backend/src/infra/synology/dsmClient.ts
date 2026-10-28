import type { HttpClient, HttpRequest, HttpResponse } from "../http/client.js";
import { UnauthorizedError, UnavailableError } from "../../core/errors.js";

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
    signal?: AbortSignal
  ): Promise<T>;
}

interface DsmEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code?: number };
}

/**
 * Parse a DSM reply. A 5xx from a reverse proxy or a rebooting NAS is usually
 * an HTML page, which would otherwise surface as a raw JSON SyntaxError.
 */
async function readEnvelope<T>(
  res: HttpResponse,
  what: string
): Promise<DsmEnvelope<T>> {
  if (res.status < 200 || res.status >= 300) {
    // Consume the body so undici can release the connection.
    await res.text().catch(() => undefined);
    throw new UnavailableError(`synology dsm ${what}: HTTP ${res.status}`);
  }
  try {
    return await res.json<DsmEnvelope<T>>();
  } catch {
    throw new UnavailableError(`synology dsm ${what}: response is not JSON`);
  }
}

/** DSM error codes that indicate the session has expired and re-login is needed:
 *  106 session timeout, 107 session interrupted by a duplicate login, and
 *  119 ("SID not found"), which DSM returns for a sid it no longer knows,
 *  e.g. after a NAS reboot. */
const AUTH_RETRY_CODES = new Set([106, 107, 119]);
/** 105: the logged-in account lacks permission for this API. Logging in
 *  again cannot fix that, and doing it every poll piles up DSM sessions. */
const PERMISSION_DENIED_CODE = 105;

/**
 * Minimal Synology DSM HTTP client.
 *
 * - Routes `SYNO.API.Auth` → `/webapi/auth.cgi`; all other APIs → `/webapi/entry.cgi`
 * - Sends all parameters (including credentials and `_sid`) in a POST form
 *   body — never in the URL, which proxies/APM tooling routinely log
 * - On session error codes 106/107/119: re-logs in once, retries the original call
 * - Code 105 (insufficient privilege) is an UnauthorizedError, with no re-login
 * - Concurrent calls share a single pending login — no thundering herd
 */
export function createDsmClient(deps: DsmClientDeps): DsmClient {
  const { http, config } = deps;
  const base = config.baseUrl.replace(/\/+$/, "");
  let currentSid: string | undefined = config.initialSid;
  let pendingLogin: Promise<string> | null = null;

  /** An untrusted certificate (DSM's default is self-signed) otherwise shows
   *  only as a generic "http request failed"; say what to do about it. */
  async function send(req: HttpRequest): Promise<HttpResponse> {
    try {
      return await http.send(req);
    } catch (e) {
      const cause = e instanceof UnavailableError ? e.context?.["cause"] : undefined;
      if (typeof cause === "string" && /certificate/i.test(cause)) {
        throw new UnavailableError(
          `synology dsm: the certificate at ${base} is not trusted (${cause}); set the DSM certificate fingerprint to trust DSM's self-signed certificate`
        );
      }
      throw e;
    }
  }

  async function performLogin(signal?: AbortSignal): Promise<string> {
    const body = new URLSearchParams({
      api: "SYNO.API.Auth",
      version: "3",
      method: "login",
      account: config.account,
      passwd: config.password,
      format: "sid",
    }).toString();
    const res = await send({
      url: `${base}/webapi/auth.cgi`,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      timeoutMs: config.timeoutMs,
      ...(signal ? { signal } : {}),
    });
    const env = await readEnvelope<{ sid: string }>(res, "login");
    if (!env.success || !env.data?.sid) {
      throw new UnauthorizedError(
        `synology dsm login failed: code ${env.error?.code ?? "unknown"}`
      );
    }
    return env.data.sid;
  }

  async function doLogin(signal?: AbortSignal): Promise<string> {
    if (!config.account || !config.password) {
      throw new UnauthorizedError("synology dsm credentials not configured");
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
        }
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
    signal?: AbortSignal
  ): Promise<DsmEnvelope<T>> {
    const body = new URLSearchParams({
      api,
      version: String(version),
      method,
      _sid: sid,
      ...params,
    }).toString();
    const res = await send({
      url: `${base}/webapi/entry.cgi`,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      timeoutMs: config.timeoutMs,
      ...(signal ? { signal } : {}),
    });
    return readEnvelope<T>(res, `${api}.${method}`);
  }

  return {
    async call<T>(
      api: string,
      version: number,
      method: string,
      params: Record<string, string> = {},
      signal?: AbortSignal
    ): Promise<T> {
      const sid = currentSid ?? (await doLogin(signal));

      const env = await callOnce<T>(api, version, method, params, sid, signal);
      if (env.success) return env.data as T;

      const code = env.error?.code ?? 0;

      if (code === PERMISSION_DENIED_CODE) {
        throw new UnauthorizedError(
          `synology dsm account lacks permission for ${api}.${method} (code 105); use an account in the administrators group`
        );
      }

      if (AUTH_RETRY_CODES.has(code)) {
        // only drop the sid this call used; a concurrent call may already
        // have replaced it with a fresh one
        if (currentSid === sid) currentSid = undefined;
        const freshSid = currentSid ?? (await doLogin(signal));
        const retried = await callOnce<T>(
          api,
          version,
          method,
          params,
          freshSid,
          signal
        );
        if (retried.success) return retried.data as T;
        throw new UnavailableError(
          `synology dsm ${api}.${method} failed after re-login: code ${retried.error?.code ?? "unknown"}`
        );
      }

      throw new UnavailableError(
        `synology dsm ${api}.${method} error: code ${code}`
      );
    },
  };
}
