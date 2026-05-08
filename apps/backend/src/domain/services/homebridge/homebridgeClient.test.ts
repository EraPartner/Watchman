import { describe, it, expect, vi } from 'vitest';
import { createHomebridgeClient, type HomebridgeClientConfig } from './homebridgeClient.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../../../infra/http/client.js';
import { UnauthorizedError, UnavailableError } from '../../../core/errors.js';

type Handler = (req: HttpRequest) => Partial<HttpResponse> & { status: number; body?: string };

function fakeHttp(handler: Handler): { http: HttpClient; calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  const http: HttpClient = {
    async send(req) {
      calls.push(req);
      const r = handler(req);
      const body = r.body ?? '';
      return {
        status: r.status,
        headers: r.headers ?? {},
        text: async () => body,
        json: async () => JSON.parse(body),
      };
    },
  };
  return { http, calls };
}

const baseCfg: HomebridgeClientConfig = {
  baseUrl: 'http://hb.local',
  username: '',
  password: '',
  authToken: '',
  loginPath: '/api/auth/login',
  timeoutMs: 1000,
};

describe('homebridgeClient', () => {
  it('throws UnavailableError when baseUrl empty', async () => {
    const { http } = fakeHttp(() => ({ status: 200, body: '{}' }));
    const client = createHomebridgeClient({ http, config: { ...baseCfg, baseUrl: '' } });
    await expect(client.get('/x', new AbortController().signal)).rejects.toBeInstanceOf(UnavailableError);
  });

  it('sends bearer header when authToken provided and parses JSON', async () => {
    const { http, calls } = fakeHttp(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    }));
    const client = createHomebridgeClient({ http, config: { ...baseCfg, authToken: 'T' } });
    const r = await client.get<{ ok: boolean }>('/api/status', new AbortController().signal);
    expect(r).toEqual({ ok: true });
    expect(calls[0]?.headers?.['authorization']).toBe('Bearer T');
  });

  it('detects HTML login page as Unauthorized', async () => {
    const { http } = fakeHttp(() => ({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><body>login</body></html>',
    }));
    const client = createHomebridgeClient({ http, config: { ...baseCfg, authToken: 'T' } });
    await expect(client.get('/x', new AbortController().signal)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('maps 5xx to UnavailableError', async () => {
    const { http } = fakeHttp(() => ({ status: 500, body: 'boom' }));
    const client = createHomebridgeClient({ http, config: { ...baseCfg, authToken: 'T' } });
    await expect(client.get('/x', new AbortController().signal)).rejects.toBeInstanceOf(UnavailableError);
  });

  it('retries after login when initial request is 401 and credentials present', async () => {
    let stage = 0;
    const { http, calls } = fakeHttp((req) => {
      stage++;
      if (stage === 1) return { status: 401, body: 'nope' };
      if (req.url.endsWith('/api/auth/login')) {
        return { status: 200, body: JSON.stringify({ token: 'tok-abc' }) };
      }
      return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"v":1}' };
    });
    const client = createHomebridgeClient({
      http,
      config: { ...baseCfg, username: 'u', password: 'p' },
    });
    const r = await client.get<{ v: number }>('/api/status', new AbortController().signal);
    expect(r).toEqual({ v: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[2]?.headers?.['authorization']).toBe('Bearer tok-abc');
  });

  it('captures cookie from login response when no token', async () => {
    let stage = 0;
    const { http, calls } = fakeHttp((req) => {
      stage++;
      if (stage === 1) return { status: 401, body: '' };
      if (req.url.endsWith('/api/auth/login')) {
        return { status: 200, headers: { 'set-cookie': 'sid=xyz; path=/' }, body: '' };
      }
      return { status: 200, headers: { 'content-type': 'application/json' }, body: '{}' };
    });
    const client = createHomebridgeClient({
      http,
      config: { ...baseCfg, username: 'u', password: 'p' },
    });
    await client.get('/api/status', new AbortController().signal);
    expect(calls[2]?.headers?.['cookie']).toBe('sid=xyz');
  });

  it('propagates Unauthorized when credentials absent', async () => {
    const { http } = fakeHttp(() => ({ status: 401, body: '' }));
    const client = createHomebridgeClient({ http, config: { ...baseCfg, authToken: 'T' } });
    await expect(client.get('/x', new AbortController().signal)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('returns null for empty body and raw text when not JSON', async () => {
    let stage = 0;
    const { http } = fakeHttp(() => {
      stage++;
      if (stage === 1) return { status: 200, headers: { 'content-type': 'text/plain' }, body: '' };
      return { status: 200, headers: { 'content-type': 'text/plain' }, body: 'plain-string' };
    });
    const client = createHomebridgeClient({ http, config: { ...baseCfg, authToken: 'T' } });
    const empty = await client.get<unknown>('/a', new AbortController().signal);
    expect(empty).toBeNull();
    const text = await client.get<string>('/b', new AbortController().signal);
    expect(text).toBe('plain-string');
  });

  it('strips trailing slash from baseUrl and prepends slash to bare path', async () => {
    const { http, calls } = fakeHttp(() => ({ status: 200, body: '{}' }));
    const client = createHomebridgeClient({
      http,
      config: { ...baseCfg, baseUrl: 'http://hb.local///', authToken: 'T' },
    });
    await client.get('api/status', new AbortController().signal);
    expect(calls[0]?.url).toBe('http://hb.local/api/status');
  });

  // ── HB1: JWT via createJwtClient ─────────────────────────────────────────

  it('HB1 — concurrent 401s share one login call (no thundering herd)', async () => {
    let loginCalls = 0;
    let resolveLogin!: () => void;
    const loginGate = new Promise<void>((res) => { resolveLogin = res; });

    const http: HttpClient = {
      send: vi.fn(async (req: HttpRequest): Promise<HttpResponse> => {
        if (req.url.includes(baseCfg.loginPath)) {
          loginCalls++;
          await loginGate;
          return {
            status: 200, headers: {},
            text: async () => '{"token":"hb-fresh"}',
            json: async () => ({ token: 'hb-fresh' }),
          };
        }
        if ((req.headers?.['authorization'] ?? '') === 'Bearer hb-fresh') {
          return {
            status: 200, headers: { 'content-type': 'application/json' },
            text: async () => '{"ok":true}',
            json: async () => ({ ok: true }),
          };
        }
        return { status: 401, headers: {}, text: async () => '', json: async () => ({}) };
      }),
    };
    const client = createHomebridgeClient({ http, config: { ...baseCfg, username: 'u', password: 'p' } });
    const sig = () => new AbortController().signal;

    const [r1, r2, r3] = await Promise.all([
      (async () => {
        const p = client.get<{ ok: boolean }>('/api/a', sig());
        resolveLogin();
        return p;
      })(),
      client.get<{ ok: boolean }>('/api/b', sig()),
      client.get<{ ok: boolean }>('/api/c', sig()),
    ]);

    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(r3).toEqual({ ok: true });
    // createJwtClient shares one pendingRefresh — login called exactly once
    expect(loginCalls).toBe(1);
  });

  it('HB1 — uses refreshed token for all requests after first 401', async () => {
    const responses: HttpResponse[] = [
      // request 1 first attempt → 401
      { status: 401, headers: {}, text: async () => '', json: async () => ({}) },
      // login → token
      { status: 200, headers: {}, text: async () => '{"token":"new-tok"}', json: async () => ({ token: 'new-tok' }) },
      // request 1 retry → 200
      { status: 200, headers: { 'content-type': 'application/json' }, text: async () => '{"v":1}', json: async () => ({ v: 1 }) },
      // request 2 (subsequent) → 200
      { status: 200, headers: { 'content-type': 'application/json' }, text: async () => '{"v":2}', json: async () => ({ v: 2 }) },
    ];
    let idx = 0;
    const { http, calls } = fakeHttp(() => {
      const r = responses[idx++]!;
      return { status: r.status, headers: r.headers, body: '' };
    });
    // Override fakeHttp to return proper text/json from HttpResponse objects
    const smartHttp: HttpClient = {
      send: async (req: HttpRequest): Promise<HttpResponse> => {
        calls.push(req);
        return responses[idx++]!;
      },
    };
    idx = 0;

    const client = createHomebridgeClient({ http: smartHttp, config: { ...baseCfg, username: 'u', password: 'p' } });
    const sig = new AbortController().signal;

    await client.get('/api/a', sig);
    await client.get('/api/b', sig);

    // 4th call (index 3) should have Bearer new-tok
    expect(calls[3]?.headers?.['authorization']).toBe('Bearer new-tok');
  });
});
