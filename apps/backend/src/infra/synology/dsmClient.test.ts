import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createDsmClient, type DsmClientConfig } from './dsmClient.js';
import { createHttpClient } from '../http/client.js';
import { UnauthorizedError, UnavailableError } from '../../core/errors.js';

interface DsmEnvelope {
  success: boolean;
  data?: unknown;
  error?: { code: number };
}

let server: Server;
let port: number;
let state: {
  loginSid: string;
  loginCallCount: number;
  loginErrorCode: number | null;
  responses: Record<string, unknown>;
  firstCallErrors: Record<string, number>;
  persistentErrors: Record<string, number>;
  calls: Array<{ path: string; params: Record<string, string> }>;
};

function handler(req: IncomingMessage, res: ServerResponse) {
  let body = '';
  req.on('data', (c: Buffer) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const params = Object.fromEntries(url.searchParams.entries());
    state.calls.push({ path: url.pathname, params });

    const api = params['api'] ?? '';
    const method = params['method'] ?? '';
    const key = `${api}/${method}`;

    // Login
    if (api === 'SYNO.API.Auth' && method === 'login') {
      state.loginCallCount++;
      const envelope: DsmEnvelope =
        state.loginErrorCode !== null
          ? { success: false, error: { code: state.loginErrorCode } }
          : { success: true, data: { sid: state.loginSid } };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(envelope));
      return;
    }

    // First-call errors (consumed on use)
    if (key in state.firstCallErrors) {
      const code = state.firstCallErrors[key]!;
      delete state.firstCallErrors[key];
      const envelope: DsmEnvelope = { success: false, error: { code } };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(envelope));
      return;
    }

    // Persistent errors
    if (key in state.persistentErrors) {
      const code = state.persistentErrors[key]!;
      const envelope: DsmEnvelope = { success: false, error: { code } };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(envelope));
      return;
    }

    const envelope: DsmEnvelope = { success: true, data: state.responses[key] ?? null };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(envelope));
  });
}

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer(handler);
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

beforeEach(() => {
  state = {
    loginSid: 'test-sid-1',
    loginCallCount: 0,
    loginErrorCode: null,
    responses: {
      'SYNO.DSM.Info/get': { model: 'DS920+', version: '7.2' },
    },
    firstCallErrors: {},
    persistentErrors: {},
    calls: [],
  };
});

function makeConfig(overrides: Partial<DsmClientConfig> = {}): DsmClientConfig {
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    account: 'admin',
    password: 'secret',
    timeoutMs: 2_000,
    ...overrides,
  };
}

describe('createDsmClient', () => {
  it('uses initialSid and skips login when provided', async () => {
    const client = createDsmClient({
      http: createHttpClient(),
      config: makeConfig({ initialSid: 'preloaded-sid' }),
    });
    const data = await client.call<{ model: string }>(
      'SYNO.DSM.Info',
      1,
      'get',
      {},
      new AbortController().signal,
    );
    expect(data.model).toBe('DS920+');
    expect(state.loginCallCount).toBe(0);
    const entryCall = state.calls.find((c) => c.path === '/webapi/entry.cgi');
    expect(entryCall?.params['_sid']).toBe('preloaded-sid');
  });

  it('performs login on first call when no initialSid', async () => {
    const client = createDsmClient({ http: createHttpClient(), config: makeConfig() });
    const data = await client.call<{ model: string }>(
      'SYNO.DSM.Info',
      1,
      'get',
      {},
      new AbortController().signal,
    );
    expect(data.model).toBe('DS920+');
    expect(state.loginCallCount).toBe(1);
  });

  it('routes SYNO.API.Auth to auth.cgi and others to entry.cgi', async () => {
    const client = createDsmClient({ http: createHttpClient(), config: makeConfig() });
    await client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal);
    const paths = state.calls.map((c) => c.path);
    expect(paths).toContain('/webapi/auth.cgi');
    expect(paths).toContain('/webapi/entry.cgi');
  });

  it('retries with fresh SID on error code 105', async () => {
    state.firstCallErrors['SYNO.DSM.Info/get'] = 105;
    state.loginSid = 'fresh-sid-105';
    const client = createDsmClient({
      http: createHttpClient(),
      config: makeConfig({ initialSid: 'stale-sid' }),
    });
    const data = await client.call<{ model: string }>(
      'SYNO.DSM.Info',
      1,
      'get',
      {},
      new AbortController().signal,
    );
    expect(data.model).toBe('DS920+');
    expect(state.loginCallCount).toBe(1);
    const entryCalls = state.calls.filter((c) => c.path === '/webapi/entry.cgi');
    expect(entryCalls.at(-1)?.params['_sid']).toBe('fresh-sid-105');
  });

  it('retries with fresh SID on error code 106', async () => {
    state.firstCallErrors['SYNO.DSM.Info/get'] = 106;
    state.loginSid = 'fresh-sid-106';
    const client = createDsmClient({
      http: createHttpClient(),
      config: makeConfig({ initialSid: 'stale-106' }),
    });
    await client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal);
    expect(state.loginCallCount).toBe(1);
  });

  it('retries with fresh SID on error code 107', async () => {
    state.firstCallErrors['SYNO.DSM.Info/get'] = 107;
    state.loginSid = 'fresh-sid-107';
    const client = createDsmClient({
      http: createHttpClient(),
      config: makeConfig({ initialSid: 'stale-107' }),
    });
    await client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal);
    expect(state.loginCallCount).toBe(1);
  });

  it('throws UnavailableError if retry also fails with auth code', async () => {
    state.persistentErrors['SYNO.DSM.Info/get'] = 105;
    const client = createDsmClient({
      http: createHttpClient(),
      config: makeConfig({ initialSid: 'stale' }),
    });
    await expect(
      client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
  });

  it('throws UnavailableError on non-auth DSM error code', async () => {
    state.persistentErrors['SYNO.DSM.Info/get'] = 402;
    const client = createDsmClient({
      http: createHttpClient(),
      config: makeConfig({ initialSid: 'valid-sid' }),
    });
    await expect(
      client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnavailableError);
  });

  it('throws UnauthorizedError when no credentials configured', async () => {
    const client = createDsmClient({
      http: createHttpClient(),
      config: makeConfig({ account: '', password: '' }),
    });
    await expect(
      client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('concurrent calls with no SID share a single login', async () => {
    const client = createDsmClient({ http: createHttpClient(), config: makeConfig() });
    const [a, b] = await Promise.all([
      client.call<{ model: string }>('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal),
      client.call<{ model: string }>('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal),
    ]);
    expect(a.model).toBe('DS920+');
    expect(b.model).toBe('DS920+');
    expect(state.loginCallCount).toBe(1);
  });

  it('propagates login failure to all waiting callers', async () => {
    state.loginErrorCode = 400;
    const client = createDsmClient({ http: createHttpClient(), config: makeConfig() });
    const [a, b] = await Promise.allSettled([
      client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal),
      client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal),
    ]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('rejected');
    expect(state.loginCallCount).toBe(1);
  });

  it('persists acquired SID across subsequent calls', async () => {
    state.loginSid = 'persistent-sid';
    const client = createDsmClient({ http: createHttpClient(), config: makeConfig() });
    await client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal);
    await client.call('SYNO.DSM.Info', 1, 'get', {}, new AbortController().signal);
    expect(state.loginCallCount).toBe(1);
    const entryCalls = state.calls.filter((c) => c.path === '/webapi/entry.cgi');
    expect(entryCalls.every((c) => c.params['_sid'] === 'persistent-sid')).toBe(true);
  });
});
