import { describe, it, expect } from 'vitest';
import { RouterService } from './RouterService.js';
import type { PingProber, PingRequest, PingResult } from '../../../infra/net/pingProbe.js';
import type { TcpProber, TcpProbeRequest } from '../../../infra/net/tcpProbe.js';
import type { RouterInstance } from '../../../config/services.js';

function makeConfig(overrides: Partial<RouterInstance> = {}): RouterInstance {
  return {
    kind: 'router',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: '192.168.1.1',
    ports: [80, 443],
    pingCount: 1,
    ...overrides,
  };
}

function fakePing(result: PingResult): PingProber {
  return { probe: async (_: PingRequest) => result };
}

function fakeTcp(map: Record<number, boolean>): TcpProber {
  return { probe: async (req: TcpProbeRequest) => Boolean(map[req.port]) };
}

describe('RouterService', () => {
  it('id is kind:instanceId', () => {
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe('router:main');
  });

  it('reachable when any port open', async () => {
    const svc = new RouterService({
      ping: fakePing({ success: false }),
      tcp: fakeTcp({ 80: true, 443: false }),
      config: makeConfig(),
      now: () => 5,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.anyPortOpen).toBe(true);
      expect(res.value.details?.icmpAlive).toBe(false);
    }
  });

  it('reachable when icmp alive and no ports open', async () => {
    const svc = new RouterService({
      ping: fakePing({ success: true, avgMs: 12 }),
      tcp: fakeTcp({ 80: false, 443: false }),
      config: makeConfig(),
      now: () => 5,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.latencyMs).toBe(12);
      expect(res.value.details?.icmpAlive).toBe(true);
    }
  });

  it('not reachable when everything fails', async () => {
    const svc = new RouterService({
      ping: fakePing({ success: false }),
      tcp: fakeTcp({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('getStats exposes host+portCount', async () => {
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      config: makeConfig({ ports: [22, 80, 443] }),
      now: () => 7,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.host).toBe('192.168.1.1');
      expect(res.value.metrics.portCount).toBe(3);
      expect(res.value.metrics.configured).toBe(true);
    }
  });
});
