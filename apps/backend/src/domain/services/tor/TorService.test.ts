import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { TorService } from './TorService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import { NotFoundError, UnavailableError } from '../../../core/errors.js';
import type { TorInstance } from '../../../config/services.js';

let server: Server;
let port: number;
let state: { status: number; payload: unknown; lastSearch: string | null };

function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/details') {
    state.lastSearch = url.searchParams.get('search');
    res.writeHead(state.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state.payload));
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
    status: 200,
    payload: {
      relays: [
        {
          nickname: 'MyRelay',
          fingerprint: 'ABCD1234EFGH5678IJKL',
          running: true,
          hibernating: false,
          flags: ['Guard', 'Fast', 'Running'],
          country: 'us',
          country_name: 'United States',
          city_name: 'Seattle',
          first_seen: '2020-01-01',
          last_seen: '2026-04-18',
          consensus_weight: 1234,
          platform: 'Tor 0.4.8.10 on Linux',
          contact: 'op@example.com',
          or_addresses: ['10.0.0.1:9001'],
          version: '0.4.8.10',
          observed_bandwidth: 5000,
          bandwidth_burst: 8000,
        },
      ],
    },
    lastSearch: null,
  };
});

function makeConfig(overrides: Partial<TorInstance> = {}): TorInstance {
  return {
    kind: 'tor',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    relayNickname: 'MyRelay',
    onionooBaseUrl: `http://127.0.0.1:${port}`,
    ...overrides,
  };
}

describe('TorService', () => {
  it('id is tor:main', () => {
    const svc = new TorService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('tor:main');
  });

  it('checkHealth reports reachable when relay is running', async () => {
    const svc = new TorService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.version).toBe('0.4.8.10');
    }
    expect(state.lastSearch).toBe('MyRelay');
  });

  it('returns NotFoundError when relay missing', async () => {
    state.payload = { relays: [] };
    const svc = new TorService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(NotFoundError);
  });

  it('warns and marks unreachable when hibernating', async () => {
    state.payload = { relays: [{ ...(state.payload as { relays: unknown[] }).relays[0] as object, hibernating: true }] };
    const svc = new TorService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(false);
      expect(res.value.details?.warning).toMatch(/hibernat/i);
    }
  });

  it('getStats exposes relay metrics', async () => {
    const svc = new TorService({ http: createHttpClient(), config: makeConfig(), now: () => 42 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        nickname: 'MyRelay',
        running: true,
        relayType: 'guard',
        orPort: 9001,
        country: 'United States',
        consensusWeight: 1234,
      });
    }
  });

  it('picks exact-match nickname over first result', async () => {
    state.payload = {
      relays: [
        { nickname: 'MyRelayAlt', fingerprint: 'ZZZ', running: true },
        { nickname: 'MyRelay', fingerprint: 'AAA', running: true },
      ],
    };
    const svc = new TorService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.nickname).toBe('MyRelay');
  });

  it('upstream 500 yields UnavailableError', async () => {
    state.status = 500;
    state.payload = {};
    const svc = new TorService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });

  it('connection failure yields UnavailableError', async () => {
    const svc = new TorService({
      http: createHttpClient(),
      config: makeConfig({ onionooBaseUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });
});
