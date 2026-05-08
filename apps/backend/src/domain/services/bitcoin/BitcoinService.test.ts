import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { BitcoinService } from './BitcoinService.js';
import { createHttpClient } from '../../../infra/http/client.js';
import type { BitcoinInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { ZmqConnectFn, ZmqMessage, ZmqSubscriberHandle } from '../../../infra/zmq/zmqSubscriber.js';

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

let server: Server;
let port: number;
let state: {
  requireAuth: boolean;
  responses: Record<string, unknown>;
  rpcError: { message: string } | null;
  methodErrors: Record<string, { message: string }>;
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
    const methodError = state.methodErrors[method] ?? state.rpcError ?? null;
    const envelope = methodError
      ? { result: null, error: methodError, id: 'watchman' }
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
      getpeerinfo: [{ addr: '1.2.3.4:8333' }, { addr: '5.6.7.8:8333' }],
      getnettotals: { totalbytesrecv: 100_000_000, totalbytessent: 50_000_000 },
      getmininginfo: { networkhashps: 0, pooledtx: 50 },
      getindexinfo: { txindex: { synced: true, best_block_height: 850000 } },
    },
    methodErrors: {},
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
    zmqHashblockEndpoint: '',
    zmqRawtxEndpoint: '',
    ...overrides,
  };
}

// ── BT2 helper: controllable ZMQ fake ────────────────────────────────────────

function makeFakeZmq(): {
  connect: ZmqConnectFn;
  emit: (msg: ZmqMessage) => void;
  isClosed: () => boolean;
  connectCalls: Array<{ endpoint: string; topics: string[] }>;
} {
  const handlers = new Set<(msg: ZmqMessage) => void>();
  let closed = false;
  const connectCalls: Array<{ endpoint: string; topics: string[] }> = [];

  const handle: ZmqSubscriberHandle = {
    onMessage(h) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    async close() {
      closed = true;
      handlers.clear();
    },
  };

  const connect: ZmqConnectFn = async (endpoint, topics) => {
    connectCalls.push({ endpoint, topics });
    return handle;
  };

  const emit = (msg: ZmqMessage) => {
    if (!closed) for (const h of handlers) h(msg);
  };

  return { connect, emit, isClosed: () => closed, connectCalls };
}

function hashblockMsg(hexHash: string, seq = 0): ZmqMessage {
  return { topic: 'hashblock', data: Buffer.from(hexHash, 'hex'), sequence: seq };
}

describe('BitcoinService', () => {
  it('id is bitcoin:main', () => {
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    expect(svc.id).toBe('bitcoin:main');
  });

  it('checkHealth reachable when getblockchaininfo returns chain', async () => {
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 1 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.chain).toBe('main');
      expect(res.value.details?.version).toBe('27.0.0');
    }
  });

  it('sends basic auth header', async () => {
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    await svc.checkHealth(new AbortController().signal);
    expect(state.lastAuth).toBe('Basic ' + Buffer.from('user:pw').toString('base64'));
  });

  it('401 yields unreachable snapshot', async () => {
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ rpcPassword: 'wrong' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('missing credentials yields unreachable snapshot', async () => {
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ rpcUser: '', rpcPassword: '' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('rpc error envelope yields unreachable snapshot', async () => {
    state.rpcError = { message: 'Method not found' };
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('500 response yields unreachable snapshot', async () => {
    state.httpStatus = 500;
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('getStats exposes node metrics', async () => {
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 42 });
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
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.details?.version).toBe('27.1.0');
  });

  it('connection failure yields unreachable snapshot', async () => {
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ rpcUrl: 'http://127.0.0.1:1' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  // ── BT1: extended stats ────────────────────────────────────────────────────

  it('BT1 — getStats includes peer count, net totals, mining, and tx index', async () => {
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        peerCount: 2,
        totalBytesRecv: 100_000_000,
        totalBytesSent: 50_000_000,
        hashesPerSec: 0,
        txIndexSynced: true,
        txIndexHeight: 850000,
      });
    }
    expect(state.calls).toEqual(
      expect.arrayContaining(['getpeerinfo', 'getnettotals', 'getmininginfo', 'getindexinfo']),
    );
  });

  it('BT1 — getStats gracefully handles failures in extended RPC calls', async () => {
    state.methodErrors = {
      getpeerinfo: { message: 'Method not found' },
      getnettotals: { message: 'Method not found' },
      getmininginfo: { message: 'Method not found' },
      getindexinfo: { message: 'Method not found' },
    };
    const svc = new BitcoinService({ http: createHttpClient(), ping: fakePing(), config: makeConfig(), now: () => 0 });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        peerCount: 0,
        totalBytesRecv: 0,
        totalBytesSent: 0,
        hashesPerSec: 0,
        txIndexSynced: false,
        txIndexHeight: 0,
      });
      // base metrics still intact
      expect(res.value.metrics.chain).toBe('main');
    }
  });
});

// ── BT2: ZMQ subscription ─────────────────────────────────────────────────────

describe('BitcoinService — ZMQ (BT2)', () => {
  it('onStart connects to configured zmqHashblockEndpoint', async () => {
    const zmq = makeFakeZmq();
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ zmqHashblockEndpoint: 'tcp://127.0.0.1:28332' }),
      now: () => 0,
      zmqConnect: zmq.connect,
    });
    await svc.onStart();
    expect(zmq.connectCalls).toHaveLength(1);
    expect(zmq.connectCalls[0]).toEqual({ endpoint: 'tcp://127.0.0.1:28332', topics: ['hashblock'] });
  });

  it('hashblock message updates zmqLastBlockHash, zmqLastBlockAt, and increments zmqBlockCount', async () => {
    let tick = 1000;
    const zmq = makeFakeZmq();
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ zmqHashblockEndpoint: 'tcp://127.0.0.1:28332' }),
      now: () => tick,
      zmqConnect: zmq.connect,
    });
    await svc.onStart();

    const hash1 = 'deadbeef'.repeat(8);
    tick = 2000;
    zmq.emit(hashblockMsg(hash1, 1));

    const res1 = await svc.getStats(new AbortController().signal);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.value.metrics.zmqLastBlockHash).toBe(hash1);
      expect(res1.value.metrics.zmqLastBlockAt).toBe(2000);
      expect(res1.value.metrics.zmqBlockCount).toBe(1);
    }

    const hash2 = 'cafebabe'.repeat(8);
    tick = 3000;
    zmq.emit(hashblockMsg(hash2, 2));

    const res2 = await svc.getStats(new AbortController().signal);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.value.metrics.zmqLastBlockHash).toBe(hash2);
      expect(res2.value.metrics.zmqLastBlockAt).toBe(3000);
      expect(res2.value.metrics.zmqBlockCount).toBe(2);
    }

    await svc.onStop();
  });

  it('getStats includes ZMQ metrics when zmqHashblockEndpoint configured', async () => {
    const zmq = makeFakeZmq();
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ zmqHashblockEndpoint: 'tcp://127.0.0.1:28332' }),
      now: () => 0,
      zmqConnect: zmq.connect,
    });
    await svc.onStart();

    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toHaveProperty('zmqLastBlockHash');
      expect(res.value.metrics).toHaveProperty('zmqLastBlockAt');
      expect(res.value.metrics).toHaveProperty('zmqBlockCount');
      expect(res.value.metrics.zmqLastBlockHash).toBe('');
      expect(res.value.metrics.zmqLastBlockAt).toBe(0);
      expect(res.value.metrics.zmqBlockCount).toBe(0);
    }

    await svc.onStop();
  });

  it('getStats omits ZMQ metrics when no zmqHashblockEndpoint configured', async () => {
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(), // zmqHashblockEndpoint: ''
      now: () => 0,
    });

    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).not.toHaveProperty('zmqLastBlockHash');
      expect(res.value.metrics).not.toHaveProperty('zmqLastBlockAt');
      expect(res.value.metrics).not.toHaveProperty('zmqBlockCount');
    }
  });

  it('onStop closes the ZMQ handle', async () => {
    const zmq = makeFakeZmq();
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ zmqHashblockEndpoint: 'tcp://127.0.0.1:28332' }),
      now: () => 0,
      zmqConnect: zmq.connect,
    });
    await svc.onStart();
    expect(zmq.isClosed()).toBe(false);
    await svc.onStop();
    expect(zmq.isClosed()).toBe(true);
  });

  it('onStop after no ZMQ start is a no-op', async () => {
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    await expect(svc.onStop()).resolves.toBeUndefined();
  });

  it('ZMQ connect failure is non-fatal — service continues without ZMQ metrics', async () => {
    const failingConnect: ZmqConnectFn = async () => {
      throw new Error('zeromq not installed');
    };
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ zmqHashblockEndpoint: 'tcp://127.0.0.1:28332' }),
      now: () => 0,
      zmqConnect: failingConnect,
    });
    // onStart must not throw
    await expect(svc.onStart()).resolves.toBeUndefined();

    // getStats still works; ZMQ metrics are zero (endpoint configured but handle null)
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.chain).toBe('main');
      expect(res.value.metrics.zmqBlockCount).toBe(0);
    }
  });

  it('messages after onStop are not delivered', async () => {
    const zmq = makeFakeZmq();
    const svc = new BitcoinService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ zmqHashblockEndpoint: 'tcp://127.0.0.1:28332' }),
      now: () => 0,
      zmqConnect: zmq.connect,
    });
    await svc.onStart();
    await svc.onStop();

    zmq.emit(hashblockMsg('deadbeef'.repeat(8), 1));

    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.zmqBlockCount).toBe(0);
    }
  });
});
