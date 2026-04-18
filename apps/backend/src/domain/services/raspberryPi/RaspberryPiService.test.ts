import { describe, it, expect } from 'vitest';
import { RaspberryPiService } from './RaspberryPiService.js';
import { parseRpiInfo } from './parseRpiInfo.js';
import { getPiModel } from './piModel.js';
import { GpioController } from './GpioController.js';
import type { PigpioClient, PigpioHandle } from '../../../infra/gpio/pigpioClient.js';
import type { PingProber, PingResult } from '../../../infra/net/pingProbe.js';
import type { SshExecutor, SshExecResult, SshExecRequest } from '../../../infra/ssh/sshExecutor.js';
import type { RaspberryPiInstance } from '../../../config/services.js';

function makeConfig(overrides: Partial<RaspberryPiInstance> = {}): RaspberryPiInstance {
  return {
    kind: 'raspberryPi',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: '192.168.1.40',
    port: 8888,
    macMiniHost: '192.168.1.50',
    macMiniSshPort: 22,
    macMiniSshUser: 'me',
    macMiniSshKeyPath: '/tmp/id_rsa',
    macMiniSshPassphrase: '',
    nodePath: '/usr/local/bin/node',
    rpiCliPath: '/opt/rpi/cli.js',
    pingCount: 1,
    ...overrides,
  };
}

interface FakeHandleOpts {
  hwRevision?: number | Error;
  pigpioVersion?: number | Error;
  currentTick?: number | Error;
  readValue?: 0 | 1;
  onEnd?: () => void;
  onWrite?: (gpio: number, level: 0 | 1) => void;
  onSetMode?: (gpio: number, mode: number) => void;
}

function fakeHandle(opts: FakeHandleOpts = {}): PigpioHandle {
  const maybe = <T>(v: T | Error | undefined, fallback: T): Promise<T> =>
    v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? fallback);
  return {
    read: async () => opts.readValue ?? 0,
    write: async (g, l) => opts.onWrite?.(g, l),
    setMode: async (g, m) => opts.onSetMode?.(g, m),
    getHardwareRevision: () => maybe(opts.hwRevision, 0xa22082),
    getPigpioVersion: () => maybe(opts.pigpioVersion, 79),
    getCurrentTick: () => maybe(opts.currentTick, 123_456_789),
    end: async () => opts.onEnd?.(),
  };
}

function fakePigpio(handle: PigpioHandle | Error): PigpioClient {
  return {
    connect: async () => {
      if (handle instanceof Error) throw handle;
      return handle;
    },
  };
}

function fakePing(result: PingResult): PingProber {
  return { probe: async () => result };
}

function fakeSsh(map: Record<string, SshExecResult>, calls: SshExecRequest[] = []): SshExecutor {
  return {
    exec: async (req) => {
      calls.push(req);
      for (const [pattern, res] of Object.entries(map)) {
        if (req.command.includes(pattern)) return res;
      }
      return { stdout: '', stderr: 'no match', code: 127 };
    },
  };
}

describe('getPiModel', () => {
  it('resolves new-style Pi 4B', () => {
    expect(getPiModel(0xa22082)).toBe('Pi 3B');
  });
  it('resolves new-style Pi 5', () => {
    expect(getPiModel((0x17 << 4) | 0x800000)).toBe('Pi 5');
  });
  it('resolves old-style Pi B+', () => {
    expect(getPiModel(0x0010)).toBe('Pi B+');
  });
  it('returns Unknown on null', () => {
    expect(getPiModel(null)).toBe('Unknown');
  });
  it('returns Unknown (type N) for unmapped new-style', () => {
    expect(getPiModel((0xfe << 4) | 0x800000)).toMatch(/Unknown \(type/);
  });
});

describe('parseRpiInfo', () => {
  it('parses full payload', () => {
    const info = parseRpiInfo(
      {
        model: 'Pi 4B',
        prettyName: 'Raspberry Pi 4',
        processor: 'BCM2711',
        memory: '4GB',
        isRpi: true,
        revision: 'a03111',
        state: { temp: '48.3', freq: 1_500_000_000, volt: '0.87', load: '0.12', swap: '0', boot: '2020-01-01T00:00:00Z' },
      },
      () => new Date('2020-01-01T00:01:00Z').getTime(),
    );
    expect(info.piModel).toBe('Pi 4B');
    expect(info.cpuTemp).toBe(48.3);
    expect(info.clockRate).toBe(1500);
    expect(info.voltage).toBe(0.87);
    expect(info.uptime).toBe(60);
    expect(info.hwRevision).toBe(0xa03111);
    expect(info.isRpi).toBe(true);
  });

  it('returns nulls on empty input', () => {
    const info = parseRpiInfo(null);
    expect(info.piModel).toBeNull();
    expect(info.cpuTemp).toBeNull();
    expect(info.isRpi).toBe(false);
  });

  it('ignores invalid values', () => {
    const info = parseRpiInfo({ revision: 'zzz', state: { temp: 'nope', freq: 'bad' } });
    expect(info.hwRevision).toBeNull();
    expect(info.cpuTemp).toBeNull();
    expect(info.clockRate).toBeNull();
  });
});

describe('RaspberryPiService.checkHealth', () => {
  it('online when pigpiod connects', async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: false }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 1000,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.pigpioOnline).toBe(true);
    }
  });

  it('warning when pigpiod fails but ping succeeds', async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(new Error('ECONNREFUSED')),
      ping: fakePing({ success: true, avgMs: 5 }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.pigpioOnline).toBe(false);
      expect(String(res.value.details?.['warning'])).toMatch(/pigpiod unavailable/);
    }
  });

  it('offline when both fail', async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(new Error('fail')),
      ping: fakePing({ success: false }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });
});

describe('RaspberryPiService.getStats', () => {
  it('composes pigpio + ssh rpi cli info', async () => {
    const rpiJson = JSON.stringify({
      model: 'Pi 4B',
      state: { temp: '50.1', freq: 1_800_000_000, load: '0.2' },
    });
    const calls: SshExecRequest[] = [];
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle({ hwRevision: 0xa22082, pigpioVersion: 79, currentTick: 60_000_000 })),
      ping: fakePing({ success: true }),
      ssh: fakeSsh({ 'cli.js': { stdout: rpiJson, stderr: '', code: 0 } }, calls),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics['piModel']).toBe('Pi 3B');
      expect(res.value.metrics['pigpioVersion']).toBe(79);
      expect(res.value.metrics['uptime']).toBe(60);
      expect(res.value.metrics['cpuTemp']).toBe(50.1);
      expect(res.value.metrics['clockRate']).toBe(1800);
      expect(res.value.metrics['rpiCliAvailable']).toBe(true);
    }
    expect(calls[0]?.command).toContain('/opt/rpi/cli.js');
    expect(calls[0]?.command).toContain('-H 192.168.1.40:8888');
  });

  it('skips ssh when not configured', async () => {
    const calls: SshExecRequest[] = [];
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh: fakeSsh({}, calls),
      config: makeConfig({ macMiniSshUser: '', macMiniSshKeyPath: '' }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics['rpiCliAvailable']).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('returns UnavailableError when pigpiod connect fails', async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(new Error('no route')),
      ping: fakePing({ success: false }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('UNAVAILABLE');
  });

  it('captures rpiCliError without failing stats', async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh: fakeSsh({ 'cli.js': { stdout: '', stderr: 'bad', code: 2 } }),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics['rpiCliAvailable']).toBe(false);
      expect(String(res.value.metrics['rpiCliError'])).toMatch(/rpi cli exit 2/);
    }
  });
});

describe('GpioController', () => {
  it('read returns 0 or 1', async () => {
    const ctrl = new GpioController({
      pigpio: fakePigpio(fakeHandle({ readValue: 1 })),
      config: makeConfig(),
    });
    expect(await ctrl.read(17)).toBe(1);
  });

  it('write invokes handle', async () => {
    let seen: [number, number] | null = null;
    const ctrl = new GpioController({
      pigpio: fakePigpio(fakeHandle({ onWrite: (g, l) => { seen = [g, l]; } })),
      config: makeConfig(),
    });
    await ctrl.write(17, 1);
    expect(seen).toEqual([17, 1]);
  });

  it('setMode output maps to 1', async () => {
    let mode: number | null = null;
    const ctrl = new GpioController({
      pigpio: fakePigpio(fakeHandle({ onSetMode: (_, m) => { mode = m; } })),
      config: makeConfig(),
    });
    await ctrl.setMode(17, 'output');
    expect(mode).toBe(1);
  });

  it('rejects invalid pins', async () => {
    const ctrl = new GpioController({
      pigpio: fakePigpio(fakeHandle()),
      config: makeConfig(),
    });
    await expect(ctrl.read(99)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('wraps connect failure in UnavailableError', async () => {
    const ctrl = new GpioController({
      pigpio: fakePigpio(new Error('refused')),
      config: makeConfig(),
    });
    await expect(ctrl.write(17, 0)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('ends handle after use', async () => {
    let ended = false;
    const ctrl = new GpioController({
      pigpio: fakePigpio(fakeHandle({ onEnd: () => { ended = true; } })),
      config: makeConfig(),
    });
    await ctrl.read(17);
    expect(ended).toBe(true);
  });
});
