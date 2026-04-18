import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AlbyHubService } from './AlbyHubService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import { UnavailableError } from '../../../core/errors.js';
import type { AlbyHubInstance } from '../../../config/services.js';

let server: Server;
let port: number;
let state: {
  respondingPaths: Set<string>;
  infoPath: string | null;
  infoPayload: unknown;
  requireAuth: boolean;
  lastAuth: string | undefined;
  seenPaths: string[];
};

function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? '';
  state.seenPaths.push(url);
  if (state.requireAuth) {
    state.lastAuth = req.headers['authorization'] as string | undefined;
  }
  if (state.infoPath && url === state.infoPath) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state.infoPayload));
    return;
  }
  if (state.respondingPaths.has(url)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
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
    respondingPaths: new Set(['/api/v1/info']),
    infoPath: '/api/v1/info',
    infoPayload: { name: 'Alby Hub', version: '1.2.3', description: 'test hub' },
    requireAuth: false,
    lastAuth: undefined,
    seenPaths: [],
  };
});

function makeConfig(overrides: Partial<AlbyHubInstance> = {}): AlbyHubInstance {
  return {
    kind: 'albyHub',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    baseUrl: `http://127.0.0.1:${port}`,
    token: '',
    ...overrides,
  };
}

describe('AlbyHubService', () => {
  it('id is albyHub:main', () => {
    const svc = new AlbyHubService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('albyHub:main');
  });

  it('checkHealth reports reachable with discovered endpoint', async () => {
    const svc = new AlbyHubService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.endpoint).toBe('/api/v1/info');
    }
  });

  it('probe falls through to later path when earlier 404s', async () => {
    state.respondingPaths = new Set(['/health']);
    state.infoPath = null;
    const svc = new AlbyHubService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.details?.endpoint).toBe('/health');
  });

  it('sends bearer token when configured', async () => {
    state.requireAuth = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      config: makeConfig({ token: 'tk_abc' }),
      now: () => 0,
    });
    await svc.checkHealth(new AbortController().signal);
    expect(state.lastAuth).toBe('Bearer tk_abc');
  });

  it('getStats extracts info fields and unwraps data envelope', async () => {
    state.infoPayload = { data: { name: 'Hub X', version: '2.0.0', description: 'wrapped' } };
    const svc = new AlbyHubService({ http: createHttpClient(), config: makeConfig(), now: () => 42 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        name: 'Hub X',
        version: '2.0.0',
        description: 'wrapped',
        endpoint: '/api/v1/info',
        reachable: true,
      });
    }
  });

  it('getStats surfaces defaults when info unavailable', async () => {
    state.respondingPaths = new Set(['/']);
    state.infoPath = null;
    const svc = new AlbyHubService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.name).toBe('Alby Hub');
      expect(res.value.metrics.reachable).toBe(false);
      expect(res.value.metrics.endpoint).toBe('/');
    }
  });

  it('connection failure yields UnavailableError', async () => {
    const svc = new AlbyHubService({
      http: createHttpClient(),
      config: makeConfig({ baseUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });
});
