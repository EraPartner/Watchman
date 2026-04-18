import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { IpfsService } from './IpfsService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import { UnavailableError } from '../../../core/errors.js';
import type { IpfsInstance } from '../../../config/services.js';

let server: Server;
let port: number;
let failMode: 'none' | 'down' | 'slow' = 'none';

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (failMode === 'down') {
          res.writeHead(500);
          res.end('boom');
          return;
        }
        const url = req.url ?? '';
        res.setHeader('content-type', 'application/json');
        if (url === '/api/v0/version') {
          if (req.method !== 'POST') {
            res.writeHead(405);
            res.end();
            return;
          }
          res.writeHead(200);
          res.end(JSON.stringify({ Version: '0.28.0' }));
        } else if (url === '/api/v0/id') {
          res.writeHead(200);
          res.end(JSON.stringify({ ID: 'QmTest', Addresses: ['/ip4/1.2.3.4/tcp/4001'] }));
        } else if (url.startsWith('/api/v0/swarm/peers')) {
          res.writeHead(200);
          res.end(JSON.stringify({ Peers: [{}, {}, {}] }));
        } else if (url.startsWith('/api/v0/repo/stat')) {
          res.writeHead(200);
          res.end(JSON.stringify({ RepoSize: 1234, NumObjects: 42 }));
        } else if (url.startsWith('/api/v0/stats/bw')) {
          res.writeHead(200);
          res.end(JSON.stringify({ TotalIn: 10, TotalOut: 20, RateIn: 1, RateOut: 2 }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
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

function makeConfig(overrides: Partial<IpfsInstance> = {}): IpfsInstance {
  return {
    kind: 'ipfs',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    apiUrl: `http://127.0.0.1:${port}`,
    forcePost: false,
    ...overrides,
  };
}

describe('IpfsService', () => {
  it('exposes kind:instanceId id', () => {
    const svc = new IpfsService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('ipfs:main');
  });

  it('checkHealth returns reachable on 200', async () => {
    failMode = 'none';
    const svc = new IpfsService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.version).toBe('0.28.0');
    }
  });

  it('checkHealth returns UnavailableError on 500', async () => {
    failMode = 'down';
    const svc = new IpfsService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
    failMode = 'none';
  });

  it('getStats aggregates endpoints', async () => {
    failMode = 'none';
    const svc = new IpfsService({ http: createHttpClient(), config: makeConfig(), now: () => 5 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        version: '0.28.0',
        nodeId: 'QmTest',
        addressCount: 1,
        peers: 3,
        repoSize: 1234,
        numObjects: 42,
        bwTotalIn: 10,
        bwRateOut: 2,
      });
    }
  });

  it('GET falls back to POST on 405', async () => {
    failMode = 'none';
    const svc = new IpfsService({
      http: createHttpClient(),
      config: makeConfig({ forcePost: false }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
  });

  it('connection failure yields UnavailableError', async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      config: makeConfig({ apiUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });
});
