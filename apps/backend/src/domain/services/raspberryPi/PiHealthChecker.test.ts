import { describe, it, expect, vi } from 'vitest';
import { PiHealthChecker } from './PiHealthChecker.js';
import type { PigpioClient, PigpioHandle } from '../../../infra/gpio/pigpioClient.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { RaspberryPiInstance } from '../../../config/services.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONFIG: RaspberryPiInstance = {
  kind: 'raspberryPi',
  instanceId: 'main',
  enabled: true,
  host: '10.0.0.5',
  port: 8888,
  pingCount: 1,
  pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
  cacheTtlMs: 10_000,
  timeoutMs: 3_000,
};

function makeFakeHandle(): PigpioHandle {
  return {
    read: vi.fn(async () => 0),
    write: vi.fn(async () => undefined),
    setMode: vi.fn(async () => undefined),
    getHardwareRevision: vi.fn(async () => 0xb03141),
    getPigpioVersion: async () => 78,
    getCurrentTick: async () => 12345,
    end: vi.fn(async () => undefined),
  };
}

function makeFakePigpio(connectImpl: () => Promise<PigpioHandle>): PigpioClient {
  return { connect: vi.fn(connectImpl) };
}

function makeFakePing(success: boolean, avgMs = 5): PingProber {
  return {
    probe: vi.fn(async () => ({ success, avgMs: success ? avgMs : undefined })),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PiHealthChecker', () => {
  const signal = new AbortController().signal;
  let now = 0;
  const mockNow = () => now;

  it('reports reachable + pigpioOnline when pigpio connects successfully', async () => {
    const handle = makeFakeHandle();
    const pigpio = makeFakePigpio(async () => handle);
    const ping = makeFakePing(true);

    const checker = new PiHealthChecker({ pigpio, ping, config: CONFIG, now: mockNow });
    const result = await checker.check(signal);

    expect(result.reachable).toBe(true);
    expect(result.pigpioOnline).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(handle.end).toHaveBeenCalled();
  });

  it('reports reachable + pigpioOnline false when pigpio fails but ping succeeds', async () => {
    const pigpio = makeFakePigpio(async () => { throw new Error('pigpiod not running'); });
    const ping = makeFakePing(true, 8);

    const checker = new PiHealthChecker({ pigpio, ping, config: CONFIG, now: mockNow });
    const result = await checker.check(signal);

    expect(result.reachable).toBe(true);
    expect(result.pigpioOnline).toBe(false);
    expect(result.warning).toMatch(/pigpiod unavailable/);
    expect(result.latencyMs).toBe(8);
  });

  it('reports unreachable when both pigpio and ping fail', async () => {
    const pigpio = makeFakePigpio(async () => { throw new Error('connection refused'); });
    const ping = makeFakePing(false);

    const checker = new PiHealthChecker({ pigpio, ping, config: CONFIG, now: mockNow });
    const result = await checker.check(signal);

    expect(result.reachable).toBe(false);
    expect(result.pigpioOnline).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it('uses latency from pigpio connect on success', async () => {
    let tick = 0;
    const fakeClock = () => { tick += 10; return tick; };
    const handle = makeFakeHandle();
    const pigpio = makeFakePigpio(async () => handle);
    const ping = makeFakePing(true);

    const checker = new PiHealthChecker({ pigpio, ping, config: CONFIG, now: fakeClock });
    const result = await checker.check(signal);

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('passes correct connect args to pigpio client', async () => {
    const connectMock = vi.fn(async () => makeFakeHandle());
    const pigpio: PigpioClient = { connect: connectMock };
    const ping = makeFakePing(true);

    const checker = new PiHealthChecker({ pigpio, ping, config: CONFIG, now: mockNow });
    await checker.check(signal);

    expect(connectMock).toHaveBeenCalledWith({
      host: CONFIG.host,
      port: CONFIG.port,
      timeoutMs: CONFIG.timeoutMs,
    });
  });

  it('passes signal and config to ping prober when pigpio fails', async () => {
    const pigpio = makeFakePigpio(async () => { throw new Error('down'); });
    const probeMock = vi.fn(async () => ({ success: true, avgMs: 3 }));
    const ping: PingProber = { probe: probeMock };

    const checker = new PiHealthChecker({ pigpio, ping, config: CONFIG, now: mockNow });
    await checker.check(signal);

    expect(probeMock).toHaveBeenCalledWith({
      host: CONFIG.host,
      timeoutMs: CONFIG.timeoutMs,
      count: CONFIG.pingCount,
      signal,
    });
  });
});
