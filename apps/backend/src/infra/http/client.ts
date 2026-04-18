import { request, type Dispatcher } from 'undici';
import { TimeoutError, UnavailableError } from '../../core/errors.js';
import { withTimeout } from '../../core/abort.js';

export interface HttpClientOptions {
  dispatcher?: Dispatcher;
  defaultTimeoutMs?: number;
  defaultHeaders?: Readonly<Record<string, string>>;
}

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Readonly<Record<string, string>>;
  body?: string | Buffer | Uint8Array;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export interface HttpClient {
  send(req: HttpRequest): Promise<HttpResponse>;
}

export function createHttpClient(opts: HttpClientOptions = {}): HttpClient {
  const timeoutMs = opts.defaultTimeoutMs ?? 5000;

  return {
    async send(req) {
      const signal = withTimeout(req.timeoutMs ?? timeoutMs, req.signal);
      try {
        const reqOpts: Parameters<typeof request>[1] = {
          method: req.method ?? 'GET',
          headers: { ...opts.defaultHeaders, ...req.headers },
          signal,
        };
        if (req.body !== undefined) reqOpts.body = req.body;
        if (opts.dispatcher) reqOpts.dispatcher = opts.dispatcher;
        const res = await request(req.url, reqOpts);
        return {
          status: res.statusCode,
          headers: res.headers as Readonly<Record<string, string | string[] | undefined>>,
          text: () => res.body.text(),
          json: <T>() => res.body.json() as Promise<T>,
        };
      } catch (e) {
        if (e instanceof TimeoutError) throw e;
        if (signal.aborted && signal.reason instanceof TimeoutError) throw signal.reason;
        throw new UnavailableError(`http request failed: ${req.method ?? 'GET'} ${req.url}`, {
          cause: e instanceof Error ? e.message : String(e),
        });
      }
    },
  };
}
