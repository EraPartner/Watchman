import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { BitcoinService } from './BitcoinService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import { UnavailableError, UnauthorizedError } from '../../../core/errors.js';
import type { BitcoinInstance } from '../../../config/services.js';

let server: Server;
let port: number;
let state: {
  requireAuth: boolean;
  responses: Record<string, unknown>;
  rpcError: { message: string } | null;
  httpStatus: number;
  lastAuth: string | undefined;
  calls: string[];
};

function handler(req: IncomingMessage, res: ServerResponse) {
  state.lastAuth = req.headers['authorization'] as string | undefined;
  if (state.requireAuth && state.lastAuth !== 'Basic ' + Buffer.from('user:pw').toString('base64')) {
    res.writeHead(401);
    res.end('unauthorized');
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let method = '';
    try {
      const parsed = JSON.parse(body) as { method?: string };
      method = parsed.method ?? '';
    } catch {
      /* ignore */
    }
    state.calls.push(method);
    if (state.httpStatus !== 200) {
      res.writeHead(state.httpStatus);
      res.end('server error');
      return;
    }
    const envelope = state.rpcError
      ? { result: null, error: state.rpcError, id: 'watchman' }
      : { result: state.responses[method] ?? null, error: null, id: 'watchman' };
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
    requireAuth: true,
    httpStatus: 200,
    rpcError: null,
    responses: {
      getblockchaininfo: {
        chain: 'main',
        blocks: 850000,
        headers: 850000,
        difficulty: 123.45,
        verificationprogress: 0.999,
        initialblockdownload: false,
        size_on_disk: 500_000_000_000,
        networkhashps: 500e18,
      },
      getnetworkinfo: {
        version: 270000,
        subversion: '/Satoshi:27.0.0/',
        protocolversion: 70016,
        connections: 10,
        connections_in: 3,
        connections_out: 7,
      },
      getmempoolinfo: { size: 50, bytes: 10_000, usage: 20_000, maxmempool: 300_000_000, mempoolminfee: 0.00001 },
      uptime: 12345,
    },
    lastAuth: undefined,
    calls: [],
  };
});

function makeConfig(overrides: Partial<BitcoinInstance> = {}): BitcoinInstance {
  return {
    kind: 'bitcoin',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    rpcUrl: `http://127.0.0.1:${port}`,
    rpcUser: 'user',
    rpcPassword: 'pw',
    ...overrides,
  };
}

describe('BitcoinService', () => {
  it('id is bitcoin:main', () => {
    const svc = new BitcoinService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('bitcoin:main');
  });

  it('checkHealth reachable when getblockchaininfo returns chain', async () => {
    const svc = new BitcoinService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.chain).toBe('main');
      expect(res.value.details?.version).toBe('27.0.0');
    }
  });

  it('sends basic auth header', async () => {
    const svc = new BitcoinService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    await svc.checkHealth(new AbortController().signal);
    expect(state.lastAuth).toBe('Basic ' + Buffer.from('user:pw').toString('base64'));
  });

  it('401 yields UnauthorizedError', async () => {
    const svc = new BitcoinService({
      http: createHttpClient(),
      config: makeConfig({ rpcPassword: 'wrong' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnauthorizedError);
  });

  it('missing credentials yields UnauthorizedError', async () => {
    const svc = new BitcoinService({
      http: createHttpClient(),
      config: makeConfig({ rpcUser: '', rpcPassword: '' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnauthorizedError);
  });

  it('rpc error envelope yields UnavailableError', async () => {
    state.rpcError = { message: 'Method not found' };
    const svc = new BitcoinService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });

  it('500 response yields UnavailableError', async () => {
    state.httpStatus = 500;
    const svc = new BitcoinService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });

  it('getStats exposes node metrics', async () => {
    const svc = new BitcoinService({ http: createHttpClient(), config: makeConfig(), now: () => 42 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        chain: 'main',
        blocks: 850000,
        connections: 10,
        inbound: 3,
        outbound: 7,
        version: '27.0.0',
        mempoolSize: 50,
        uptime: 12345,
      });
    }
    expect(state.calls).toEqual(
      expect.arrayContaining(['getblockchaininfo', 'getnetworkinfo', 'getmempoolinfo', 'uptime']),
    );
  });

  it('parses numeric-only version', async () => {
    state.responses['getnetworkinfo'] = { version: 270100 };
    const svc = new BitcoinService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.details?.version).toBe('27.1.0');
  });

  it('connection failure yields UnavailableError', async () => {
    const svc = new BitcoinService({
      http: createHttpClient(),
      config: makeConfig({ rpcUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });
});
