import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { AdGuardService } from './AdGuardService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import type { AdGuardInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

let server: Server;
let port: number;
let state: {
  running: boolean;
  protection: boolean;
  authRequired: boolean;
  lastAuth: string | undefined;
  failOptional: boolean;
};

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

  // Optional endpoints — return 500 when failOptional set
  const optionalPaths = [
    '/control/filtering/status',
    '/control/clients',
    '/control/dhcp/status',
    '/control/safebrowsing/status',
    '/control/parental/status',
    '/control/safesearch/status',
    '/control/dns_info',
  ];
  if (state.failOptional && optionalPaths.includes(url)) {
    res.writeHead(500);
    res.end(JSON.stringify({ message: 'internal error' }));
    return;
  }

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
  } else if (url === '/control/filtering/status') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        enabled: true,
        filters: [
          { rules_count: 1000, enabled: true },
          { rules_count: 500, enabled: false },
        ],
        user_rules: ['||custom.com^', '||another.com^'],
      }),
    );
  } else if (url === '/control/clients') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        clients: [{ name: 'desktop' }, { name: 'phone' }],
        auto_clients: [{ name: 'auto1' }, { name: 'auto2' }, { name: 'auto3' }],
      }),
    );
  } else if (url === '/control/dhcp/status') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        enabled: true,
        leases: [{ ip: '192.168.1.100' }, { ip: '192.168.1.101' }],
        static_leases: [{ ip: '192.168.1.10' }],
      }),
    );
  } else if (url === '/control/safebrowsing/status') {
    res.writeHead(200);
    res.end(JSON.stringify({ enabled: true }));
  } else if (url === '/control/parental/status') {
    res.writeHead(200);
    res.end(JSON.stringify({ enabled: false }));
  } else if (url === '/control/safesearch/status') {
    res.writeHead(200);
    res.end(JSON.stringify({ enabled: true }));
  } else if (url === '/control/dns_info') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        upstream_dns: ['https://dns.cloudflare.com/dns-query', '8.8.8.8'],
        upstream_mode: 'parallel',
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
  state = { running: true, protection: true, authRequired: false, lastAuth: undefined, failOptional: false };
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
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('adguard:main');
  });

  it('checkHealth reports reachable when running', async () => {
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.protectionEnabled).toBe(true);
    }
  });

  it('warns when protection disabled', async () => {
    state.protection = false;
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.warning).toMatch(/protection/i);
    }
  });

  it('not reachable when not running', async () => {
    state.running = false;
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('sends basic auth when credentials provided', async () => {
    state.authRequired = true;
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ username: 'admin', password: 'pw' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    const expected = 'Basic ' + Buffer.from('admin:pw').toString('base64');
    expect(state.lastAuth).toBe(expected);
  });

  it('getStats computes blocking rate', async () => {
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 42 });
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

  it('getStats returns filtering and client metrics', async () => {
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        filteringEnabled: true,
        filterCount: 2,
        totalRules: 1000, // disabled filter's 500 rules excluded
        userRules: 2,
        clientCount: 2,
        autoClientCount: 3,
      });
    }
  });

  it('getStats returns dhcp lease counts', async () => {
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        dhcpEnabled: true,
        dhcpLeases: 2,
        dhcpStaticLeases: 1,
      });
    }
  });

  it('getStats returns security feature states and upstream info', async () => {
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        safebrowsingEnabled: true,
        parentalEnabled: false,
        safesearchEnabled: true,
        upstreamCount: 2,
        upstreamMode: 'parallel',
      });
    }
  });

  it('getStats succeeds when optional endpoints return 500', async () => {
    state.failOptional = true;
    const svc = new AdGuardService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.getStats(new AbortController().signal);
    // Core stats should still succeed
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Core metrics intact
      expect(res.value.metrics.totalQueries).toBe(1000);
      expect(res.value.metrics.blockingRate).toBe(11.5);
      // Optional metrics fall back to null/0
      expect(res.value.metrics.filteringEnabled).toBeNull();
      expect(res.value.metrics.filterCount).toBe(0);
      expect(res.value.metrics.totalRules).toBe(0);
      expect(res.value.metrics.clientCount).toBe(0);
      expect(res.value.metrics.dhcpEnabled).toBeNull();
      expect(res.value.metrics.safebrowsingEnabled).toBeNull();
      expect(res.value.metrics.upstreamCount).toBe(0);
      expect(res.value.metrics.upstreamMode).toBeNull();
    }
  });

  it('connection failure yields unreachable snapshot', async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ baseUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });
});
