import { describe, it, expect } from 'vitest';
import { PhilipsBridgeService } from './PhilipsBridgeService.js';
import type { PingProber, PingResult } from '../../../infra/net/pingProbe.js';
import type { PhilipsBridgeInstance } from '../../../config/services.js';

function makeConfig(overrides: Partial<PhilipsBridgeInstance> = {}): PhilipsBridgeInstance {
  return {
    kind: 'philipsBridge',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: '192.168.1.50',
    pingCount: 2,
    usePing: true,
    ...overrides,
  };
}

function fakePing(result: PingResult): PingProber {
  return { probe: async () => result };
}

describe('PhilipsBridgeService', () => {
  it('id is philipsBridge:main', () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe('philipsBridge:main');
  });

  it('reachable when ping succeeds', async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true, avgMs: 5 }),
      config: makeConfig(),
      now: () => 3,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.latencyMs).toBe(5);
    }
  });

  it('unreachable when ping fails', async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: false }),
      config: makeConfig(),
      now: () => 3,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it('getStats exposes host', async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      config: makeConfig(),
      now: () => 9,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.host).toBe('192.168.1.50');
      expect(res.value.metrics.configured).toBe(true);
    }
  });
});
