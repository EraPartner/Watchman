import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { QBittorrentService } from './QBittorrentService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import type { QbittorrentInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

let server: Server;
let port: number;
let state: {
  loginStatus: number;
  cookie: string;
  expireNextRequest: boolean;
  loginCalls: number;
  lastRid: number;
};

const TORRENT_LIST = [
  {
    hash: 'abc',
    name: 'movie.mkv',
    state: 'downloading',
    progress: 0.5,
    dlspeed: 1000,
    upspeed: 100,
    size: 1_000_000_000,
    downloaded: 500_000_000,
    uploaded: 50_000_000,
    eta: 500,
    category: 'movies',
  },
  {
    hash: 'def',
    name: 'album.zip',
    state: 'uploading',
    progress: 1.0,
    dlspeed: 0,
    upspeed: 500,
    size: 100_000_000,
    downloaded: 100_000_000,
    uploaded: 200_000_000,
    eta: -1,
    category: '',
  },
];

const LOG_ENTRIES = [
  { id: 1, message: 'Disk write error', timestamp: 1_700_000_000, type: 8 },
  { id: 2, message: 'Tracker warning', timestamp: 1_700_000_001, type: 4 },
];

function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url ?? '/';
  const parsed = new URL(rawUrl, 'http://localhost');
  const pathname = parsed.pathname;

  if (pathname === '/api/v2/auth/login') {
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

  if (pathname === '/api/v2/app/version') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('v4.6.0');
  } else if (pathname === '/api/v2/app/preferences') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ listen_port: 6881 }));
  } else if (pathname === '/api/v2/sync/maindata') {
    state.lastRid = parseInt(parsed.searchParams.get('rid') ?? '0', 10);
    const isFirst = state.lastRid === 0;
    const responseRid = state.lastRid + 1;
    const body = isFirst
      ? {
          rid: responseRid,
          full_update: true,
          server_state: { uptime: 1234, connection_status: 'connected', dht_nodes: 50, free_space_on_disk: 999 },
          torrents: {
            a: { state: 'downloading' },
            b: { state: 'uploading' },
            c: { state: 'pausedDL' },
            d: { state: 'stalledUP' },
          },
        }
      : { rid: responseRid, full_update: false, server_state: { dht_nodes: 75 } };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  } else if (pathname === '/api/v2/transfer/info') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ dl_info_speed: 100, up_info_speed: 50, dl_info_data: 1000, up_info_data: 500 }));
  } else if (pathname === '/api/v2/torrents/info') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(TORRENT_LIST));
  } else if (pathname === '/api/v2/log/main') {
    const lastKnownId = parseInt(parsed.searchParams.get('last_known_id') ?? '-1', 10);
    const filtered = LOG_ENTRIES.filter((e) => e.id > lastKnownId);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(filtered));
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
  state = { loginStatus: 200, cookie: 'abc123', expireNextRequest: false, loginCalls: 0, lastRid: 0 };
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
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('qbittorrent:main');
  });

  it('checkHealth authenticates and reports reachable', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(state.loginCalls).toBe(1);
  });

  it('reuses cookie across calls', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    await svc.checkHealth(new AbortController().signal);
    await svc.checkHealth(new AbortController().signal);
    expect(state.loginCalls).toBe(1);
  });

  it('re-auths after 403', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    await svc.checkHealth(new AbortController().signal);
    state.expireNextRequest = true;
    state.cookie = 'new456';
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(state.loginCalls).toBe(2);
  });

  it('bad credentials yields unreachable snapshot', async () => {
    state.loginStatus = 403;
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('getStats aggregates endpoints and counts torrents', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 42 });
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
        torrentsError: 0,
        dlSpeed: 100,
        upSpeed: 50,
        connectionStatus: 'connected',
        listenPort: 6881,
        dhtNodes: 50,
        freeSpaceOnDisk: 999,
      });
    }
  });

  it('activeTorrents sorted by combined speed', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const active = res.value.metrics.activeTorrents as Array<{ name?: string }>;
      expect(Array.isArray(active)).toBe(true);
      expect(active).toHaveLength(2);
      // movie.mkv: dl=1000 + ul=100 = 1100 > album.zip: dl=0 + ul=500 = 500
      expect(active[0]?.name).toBe('movie.mkv');
      expect(active[1]?.name).toBe('album.zip');
    }
  });

  it('recentErrors and recentWarnings extracted from log entries', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const { recentErrors, recentWarnings } = res.value.metrics as {
        recentErrors: string[];
        recentWarnings: string[];
      };
      expect(recentErrors).toContain('Disk write error');
      expect(recentWarnings).toContain('Tracker warning');
    }
  });

  it('rid=0 on first getStats, increments to server-returned rid on second', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    await svc.getStats(new AbortController().signal);
    expect(state.lastRid).toBe(0); // first call sent rid=0

    await svc.getStats(new AbortController().signal);
    expect(state.lastRid).toBe(1); // second call sent rid=1 (from server's previous response)
  });

  it('delta maindata merges into cached server state', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });

    // First call: full_update with dht_nodes=50
    const res1 = await svc.getStats(new AbortController().signal);
    expect(res1.ok).toBe(true);
    if (res1.ok) expect(res1.value.metrics.dhtNodes).toBe(50);

    // Second call: delta with dht_nodes=75; uptime/connectionStatus preserved from cache
    const res2 = await svc.getStats(new AbortController().signal);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.value.metrics.dhtNodes).toBe(75);
      expect(res2.value.metrics.uptime).toBe(1234);
      expect(res2.value.metrics.connectionStatus).toBe('connected');
    }
  });

  it('log entries only fetched after last known id', async () => {
    const svc = new QBittorrentService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });

    // First call: last_known_id=-1 → gets both entries
    const res1 = await svc.getStats(new AbortController().signal);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      const { recentErrors, recentWarnings } = res1.value.metrics as {
        recentErrors: string[];
        recentWarnings: string[];
      };
      expect(recentErrors).toHaveLength(1);
      expect(recentWarnings).toHaveLength(1);
    }

    // Second call: last_known_id=2 → no new entries
    const res2 = await svc.getStats(new AbortController().signal);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      const { recentErrors, recentWarnings } = res2.value.metrics as {
        recentErrors: string[];
        recentWarnings: string[];
      };
      expect(recentErrors).toHaveLength(0);
      expect(recentWarnings).toHaveLength(0);
    }
  });

  it('connection failure yields unreachable snapshot', async () => {
    const svc = new QBittorrentService({
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
