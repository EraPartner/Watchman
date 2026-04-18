import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { QBittorrentService } from './QBittorrentService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import { UnauthorizedError, UnavailableError } from '../../../core/errors.js';
import type { QbittorrentInstance } from '../../../config/services.js';

let server: Server;
let port: number;
let state: {
  loginStatus: number;
  cookie: string;
  expireNextRequest: boolean;
  loginCalls: number;
};

function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? '';
  if (url === '/api/v2/auth/login') {
    state.loginCalls++;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (state.loginStatus !== 200) {
        res.writeHead(state.loginStatus);
        res.end();
        return;
      }
      res.setHeader('set-cookie', `SID=${state.cookie}; path=/`);
      res.writeHead(200);
      res.end('Ok.');
    });
    return;
  }
  const cookie = req.headers['cookie'] ?? '';
  if (!cookie.includes(`SID=${state.cookie}`) || state.expireNextRequest) {
    state.expireNextRequest = false;
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (url === '/api/v2/app/version') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('v4.6.0');
  } else if (url === '/api/v2/app/preferences') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ listen_port: 6881 }));
  } else if (url === '/api/v2/sync/maindata') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        server_state: { uptime: 1234, connection_status: 'connected', dht_nodes: 50, free_space_on_disk: 999 },
        torrents: {
          a: { state: 'downloading' },
          b: { state: 'uploading' },
          c: { state: 'pausedDL' },
          d: { state: 'stalledUP' },
        },
      }),
    );
  } else if (url === '/api/v2/transfer/info') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ dl_info_speed: 100, up_info_speed: 50, dl_info_data: 1000, up_info_data: 500 }));
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
  state = { loginStatus: 200, cookie: 'abc123', expireNextRequest: false, loginCalls: 0 };
});

function makeConfig(overrides: Partial<QbittorrentInstance> = {}): QbittorrentInstance {
  return {
    kind: 'qbittorrent',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    baseUrl: `http://127.0.0.1:${port}`,
    username: 'admin',
    password: 'secret',
    ...overrides,
  };
}

describe('QBittorrentService', () => {
  it('id is qbittorrent:main', () => {
    const svc = new QBittorrentService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('qbittorrent:main');
  });

  it('checkHealth authenticates and reports reachable', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(state.loginCalls).toBe(1);
  });

  it('reuses cookie across calls', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    await svc.checkHealth(new AbortController().signal);
    await svc.checkHealth(new AbortController().signal);
    expect(state.loginCalls).toBe(1);
  });

  it('re-auths after 403', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), config: makeConfig(), now: () => 1 });
    await svc.checkHealth(new AbortController().signal);
    state.expireNextRequest = true;
    state.cookie = 'new456';
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(state.loginCalls).toBe(2);
  });

  it('returns UnauthorizedError on bad credentials', async () => {
    state.loginStatus = 403;
    const svc = new QBittorrentService({ http: createHttpClient(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnauthorizedError);
  });

  it('getStats aggregates endpoints and counts torrents', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), config: makeConfig(), now: () => 42 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        version: 'v4.6.0',
        uptime: 1234,
        torrentsTotal: 4,
        torrentsDownloading: 1,
        torrentsSeeding: 1,
        torrentsPaused: 1,
        torrentsCompleted: 2,
        dlSpeed: 100,
        upSpeed: 50,
        connectionStatus: 'connected',
        listenPort: 6881,
        dhtNodes: 50,
        freeSpaceOnDisk: 999,
      });
    }
  });

  it('connection failure yields UnavailableError', async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      config: makeConfig({ baseUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });
});
