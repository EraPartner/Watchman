import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AlbyHubService } from './AlbyHubService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import type { AlbyHubInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

let server: Server;
let port: number;
let state: {
  respondingPaths: Set<string>;
  infoPath: string | null;
  infoPayload: unknown;
  requireAuth: boolean;
  lastAuth: string | undefined;
  seenPaths: string[];
  // NWC mode: when true, /api/info and /api/apps are served as NWC endpoints.
  // Must be false for legacy probe tests — PROBE_PATHS includes /api/info, so an
  // unconditional handler would intercept legacy probes before /api/v1/info.
  nwcMode: boolean;
  failNwcInfo: boolean;
  failNwcApps: boolean;
};

const NWC_INFO_PAYLOAD = {
  name: 'Alby Hub NWC',
  version: '1.5.0',
  connected: true,
  setupCompleted: true,
  backendType: 'LND',
};

const NWC_APPS_PAYLOAD = [
  { id: 1, name: 'App1' },
  { id: 2, name: 'App2' },
];

function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? '';
  state.seenPaths.push(url);
  if (state.requireAuth) {
    state.lastAuth = req.headers['authorization'] as string | undefined;
  }

  // NWC-specific routes — only active when nwcMode is set, so legacy probe tests
  // are not affected by /api/info being in PROBE_PATHS.
  if (state.nwcMode) {
    if (url === '/api/info') {
      if (state.failNwcInfo) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(NWC_INFO_PAYLOAD));
      return;
    }
    if (url === '/api/apps') {
      if (state.failNwcApps) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(NWC_APPS_PAYLOAD));
      return;
    }
  }

  // Legacy probe / info routes
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
    nwcMode: false,
    failNwcInfo: false,
    failNwcApps: false,
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
    legacyProbe: true,
    ...overrides,
  };
}

describe('AlbyHubService', () => {
  // ── Legacy probe (legacyProbe: true) ──────────────────────────────────────

  it('id is albyHub:main', () => {
    const svc = new AlbyHubService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('albyHub:main');
  });

  it('checkHealth reports reachable with discovered endpoint', async () => {
    const svc = new AlbyHubService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
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
    const svc = new AlbyHubService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.details?.endpoint).toBe('/health');
  });

  it('sends bearer token when configured', async () => {
    state.requireAuth = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ token: 'tk_abc' }),
      now: () => 0,
    });
    await svc.checkHealth(new AbortController().signal);
    expect(state.lastAuth).toBe('Bearer tk_abc');
  });

  it('getStats extracts info fields and unwraps data envelope', async () => {
    state.infoPayload = { data: { name: 'Hub X', version: '2.0.0', description: 'wrapped' } };
    const svc = new AlbyHubService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 42 });
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
    const svc = new AlbyHubService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.name).toBe('Alby Hub');
      expect(res.value.metrics.reachable).toBe(false);
      expect(res.value.metrics.endpoint).toBe('/');
    }
  });

  it('connection failure yields unreachable snapshot', async () => {
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ baseUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  // ── NWC deterministic path (legacyProbe: false) ───────────────────────────

  it('NWC checkHealth reports reachable with connected and version details', async () => {
    state.nwcMode = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false }),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.connected).toBe(true);
      expect(res.value.details?.version).toBe('1.5.0');
      expect(res.value.details?.endpoint).toBe('/api/info');
    }
  });

  it('NWC checkHealth reports unreachable when /api/info returns error', async () => {
    state.nwcMode = true;
    state.failNwcInfo = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false }),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('NWC getStats returns full metrics including NWC-specific fields', async () => {
    state.nwcMode = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false }),
      now: () => 10,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        name: 'Alby Hub NWC',
        version: '1.5.0',
        reachable: true,
        connected: true,
        setupCompleted: true,
        backendType: 'LND',
        appCount: 2,
        endpoint: '/api/info',
      });
    }
  });

  it('NWC getStats returns null appCount when /api/apps fails', async () => {
    state.nwcMode = true;
    state.failNwcApps = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false }),
      now: () => 5,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.reachable).toBe(true);
      expect(res.value.metrics.appCount).toBeNull();
    }
  });

  it('NWC bearer token forwarded on deterministic paths', async () => {
    state.nwcMode = true;
    state.requireAuth = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false, token: 'nwc_tok' }),
      now: () => 0,
    });
    await svc.checkHealth(new AbortController().signal);
    expect(state.lastAuth).toBe('Bearer nwc_tok');
  });
});
