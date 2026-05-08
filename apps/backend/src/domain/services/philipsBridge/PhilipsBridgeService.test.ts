import { describe, it, expect, vi } from 'vitest';
import { PhilipsBridgeService } from './PhilipsBridgeService.js';
import type { PingProber, PingResult } from '../../../infra/net/pingProbe.js';
import type { PhilipsBridgeInstance } from '../../../config/services.js';
import type { HttpClient, HttpRequest } from '../../../infra/http/client.js';

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

function fakeHttp(status: number, body: unknown): HttpClient {
  return {
    send: vi.fn(async (_req: HttpRequest) => ({
      status,
      headers: {},
      text: async () => JSON.stringify(body),
      json: async <T>() => body as T,
    })),
  };
}

describe('PhilipsBridgeService', () => {
  it('id is philipsBridge:main', () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: fakeHttp(200, {}),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe('philipsBridge:main');
  });

  it('reachable when ping succeeds', async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true, avgMs: 5 }),
      http: fakeHttp(200, {}),
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
      http: fakeHttp(200, {}),
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
      http: fakeHttp(200, {}),
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

// ─── Hue API v2 (H1) ─────────────────────────────────────────────────────────

const HUE_LIGHTS_BODY = {
  errors: [],
  data: [
    { id: 'a1', type: 'light', on: { on: true },  metadata: { name: 'Bedroom' } },
    { id: 'a2', type: 'light', on: { on: false }, metadata: { name: 'Living Room' } },
    { id: 'a3', type: 'light', on: { on: true },  metadata: { name: 'Kitchen' } },
  ],
};

function hueConfig(overrides: Partial<PhilipsBridgeInstance> = {}): PhilipsBridgeInstance {
  return makeConfig({ applicationKey: 'test-app-key', ...overrides });
}

describe('PhilipsBridgeService Hue API v2 (H1)', () => {
  it('getStats returns lightCount and onCount from /clip/v2/resource/light', async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: fakeHttp(200, HUE_LIGHTS_BODY),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.lightCount).toBe(3);
      expect(res.value.metrics.onCount).toBe(2);
    }
  });

  it('getStats includes offCount', async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: fakeHttp(200, HUE_LIGHTS_BODY),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.offCount).toBe(1);
  });

  it('uses hue-application-key header in request', async () => {
    const http = fakeHttp(200, HUE_LIGHTS_BODY);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    await svc.getStats(new AbortController().signal);
    const calls = vi.mocked(http.send).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const headers = calls[0]![0].headers ?? {};
    expect(headers['hue-application-key']).toBe('test-app-key');
  });

  it('calls /clip/v2/resource/light endpoint', async () => {
    const http = fakeHttp(200, HUE_LIGHTS_BODY);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    await svc.getStats(new AbortController().signal);
    const url = vi.mocked(http.send).mock.calls[0]![0].url;
    expect(url).toContain('/clip/v2/resource/light');
  });

  it('service reachable when API returns 200', async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: false }),
      http: fakeHttp(200, HUE_LIGHTS_BODY),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.service?.reachable).toBe(true);
      expect(res.value.reachable).toBe(true); // service alive → overall reachable
    }
  });

  it('service unreachable when API call throws', async () => {
    const http: HttpClient = {
      send: vi.fn(async () => { throw new Error('connection refused'); }),
    };
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: false }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.service?.reachable).toBe(false);
      expect(res.value.reachable).toBe(false);
    }
  });

  it('graceful when no applicationKey — no API call, basic metrics only', async () => {
    const http = fakeHttp(200, HUE_LIGHTS_BODY);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: makeConfig(), // no applicationKey
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.lightCount).toBeUndefined();
      expect(vi.mocked(http.send)).not.toHaveBeenCalled();
    }
  });

  it('getStats graceful when API throws — returns basic metrics', async () => {
    const http: HttpClient = {
      send: vi.fn(async () => { throw new Error('network error'); }),
    };
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.host).toBe('192.168.1.50');
      expect(res.value.metrics.lightCount).toBeUndefined();
    }
  });
});
