import { describe, it, expect } from 'vitest';
import { RoonService } from './RoonService.js';
import type { PingProber, PingResult } from '../../../infra/net/pingProbe.js';
import type { TcpProber, TcpProbeRequest } from '../../../infra/net/tcpProbe.js';
import type { RoonInstance } from '../../../config/services.js';

function makeConfig(overrides: Partial<RoonInstance> = {}): RoonInstance {
  return {
    kind: 'roon',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: '192.168.1.20',
    ports: [9100, 9200],
    pingCount: 2,
    usePing: true,
    ...overrides,
  };
}

function fakePing(result: PingResult): PingProber {
  return { probe: async () => result };
}

function fakeTcp(map: Record<number, boolean>): TcpProber {
  return { probe: async (req: TcpProbeRequest) => Boolean(map[req.port]) };
}

describe('RoonService', () => {
  it('id is roon:main', () => {
    const svc = new RoonService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe('roon:main');
  });

  it('reachable via open port with ping dead', async () => {
    const svc = new RoonService({
      ping: fakePing({ success: false }),
      tcp: fakeTcp({ 9100: true, 9200: false }),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.anyPortOpen).toBe(true);
    }
  });

  it('skips ping when usePing=false', async () => {
    let pinged = false;
    const ping: PingProber = {
      probe: async () => {
        pinged = true;
        return { success: true };
      },
    };
    const svc = new RoonService({
      ping,
      tcp: fakeTcp({ 9100: true, 9200: false }),
      config: makeConfig({ usePing: false }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(pinged).toBe(false);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.details?.pingEnabled).toBe(false);
  });

  it('not reachable when all probes fail', async () => {
    const svc = new RoonService({
      ping: fakePing({ success: false }),
      tcp: fakeTcp({ 9100: false, 9200: false }),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('getStats exposes config summary', async () => {
    const svc = new RoonService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      config: makeConfig(),
      now: () => 11,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.portCount).toBe(2);
      expect(res.value.metrics.pingEnabled).toBe(true);
    }
  });
});
