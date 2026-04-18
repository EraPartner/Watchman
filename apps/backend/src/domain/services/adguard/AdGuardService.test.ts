import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AdGuardService } from './AdGuardService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import { UnavailableError } from '../../../core/errors.js';
import type { AdGuardInstance } from '../../../config/services.js';

let server: Server;
let port: number;
let state: { running: boolean; protection: boolean; authRequired: boolean; lastAuth: string | undefined };

function handler(req: IncomingMessage, res: ServerResponse) {
  if (state.authRequired) {
    state.lastAuth = req.headers['authorization'] as string | undefined;
    if (!state.lastAuth) {
      res.writeHead(401);
      res.end();
      return;
    }
  }
  const url = req.url ?? '';
  res.setHeader('content-type', 'application/json');
  if (url === '/control/status') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        running: state.running,
        version: 'v0.107.50',
        protection_enabled: state.protection,
        dns_port: 53,
        http_port: 80,
      }),
    );
  } else if (url === '/control/stats') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        num_dns_queries: 1000,
        num_blocked_filtering: 100,
        num_replaced_safebrowsing: 10,
        num_replaced_safesearch: 5,
        num_replaced_parental: 0,
        avg_processing_time: 1.5,
        top_blocked_domains: [{ 'ads.example.com': 50 }],
        top_queried_domains: [{ 'good.example.com': 200 }],
        top_clients: [{ '192.168.1.10': 500 }],
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
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
  state = { running: true, protection: true, authRequired: false, lastAuth: undefined };
});

function makeConfig(overrides: Partial<AdGuardInstance> = {}): AdGuardInstance {
  return {
    kind: 'adguard',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    baseUrl: `http://127.0.0.1:${port}`,
    username: '',
    password: '',
    ...overrides,
  };
}

describe('AdGuardService', () => {
  it('id is adguard:main', () => {
    const svc = new AdGuardService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('adguard:main');
  });

  it('checkHealth reports reachable when running', async () => {
    const svc = new AdGuardService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.protectionEnabled).toBe(true);
    }
  });

  it('warns when protection disabled', async () => {
    state.protection = false;
    const svc = new AdGuardService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.warning).toMatch(/protection/i);
    }
  });

  it('not reachable when not running', async () => {
    state.running = false;
    const svc = new AdGuardService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('sends basic auth when credentials provided', async () => {
    state.authRequired = true;
    const svc = new AdGuardService({
      http: createHttpClient(),
      config: makeConfig({ username: 'admin', password: 'pw' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    const expected = 'Basic ' + Buffer.from('admin:pw').toString('base64');
    expect(state.lastAuth).toBe(expected);
  });

  it('getStats computes blocking rate', async () => {
    const svc = new AdGuardService({ http: createHttpClient(), config: makeConfig(), now: () => 42 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        totalQueries: 1000,
        blockedQueries: 115,
        allowedQueries: 885,
        blockingRate: 11.5,
        topBlockedDomain: 'ads.example.com',
        topQueriedDomain: 'good.example.com',
        topClient: '192.168.1.10',
      });
    }
  });

  it('connection failure yields UnavailableError', async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      config: makeConfig({ baseUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });
});
