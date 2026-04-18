import { describe, it, expect } from 'vitest';
import { MacMiniService } from './MacMiniService.js';
import { UnauthorizedError, UnavailableError } from '../../../core/errors.js';
import type { PingProber, PingResult } from '../../../infra/net/pingProbe.js';
import type { SshExecutor, SshExecRequest, SshExecResult } from '../../../infra/ssh/sshExecutor.js';
import type { MacMiniInstance } from '../../../config/services.js';

function makeConfig(overrides: Partial<MacMiniInstance> = {}): MacMiniInstance {
  return {
    kind: 'macMini',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: '192.168.1.50',
    sshUser: 'me',
    sshPort: 22,
    sshKeyPath: '/tmp/id_rsa',
    sshPassphrase: '',
    pingCount: 1,
    ...overrides,
  };
}

function fakePing(result: PingResult): PingProber {
  return { probe: async () => result };
}

type ExecMap = Record<string, SshExecResult | ((req: SshExecRequest) => SshExecResult)>;

function fakeSsh(map: ExecMap, calls: SshExecRequest[] = []): SshExecutor {
  return {
    exec: async (req) => {
      calls.push(req);
      const entry = map[req.command];
      if (!entry) return { stdout: '', stderr: 'not-configured', code: 127 };
      return typeof entry === 'function' ? entry(req) : entry;
    },
  };
}

const UPTIME_OUT =
  '15:04  up 1 day, 3:12, 3 users, load averages: 1.23 0.87 0.65\n';
const DF_OUT =
  'Filesystem    1K-blocks      Used Available Capacity  Mounted on\n/dev/disk1s5  488245288  12345678 475000000      3%  /\n';
const TEMP_CMD = 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; which osx-cpu-temp >/dev/null && osx-cpu-temp';

describe('MacMiniService', () => {
  it('id is macMini:main', () => {
    const svc = new MacMiniService({
      ping: fakePing({ success: true }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe('macMini:main');
  });

  it('checkHealth reachable when ping succeeds', async () => {
    const svc = new MacMiniService({
      ping: fakePing({ success: true, avgMs: 4 }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.latencyMs).toBe(4);
      expect(res.value.details?.sshConfigured).toBe(true);
    }
  });

  it('checkHealth unreachable when ping fails', async () => {
    const svc = new MacMiniService({
      ping: fakePing({ success: false }),
      ssh: fakeSsh({}),
      config: makeConfig({ sshUser: '', sshKeyPath: '' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(false);
      expect(res.value.details?.sshConfigured).toBe(false);
    }
  });

  it('getStats returns UnauthorizedError when ssh not configured', async () => {
    const svc = new MacMiniService({
      ping: fakePing({ success: true }),
      ssh: fakeSsh({}),
      config: makeConfig({ sshUser: '', sshKeyPath: '' }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnauthorizedError);
  });

  it('getStats parses load, disk, uptime, temp', async () => {
    const calls: SshExecRequest[] = [];
    const svc = new MacMiniService({
      ping: fakePing({ success: true }),
      ssh: fakeSsh(
        {
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          [TEMP_CMD]: { stdout: '55.2°C\n', stderr: '', code: 0 },
        },
        calls,
      ),
      config: makeConfig(),
      now: () => 42,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.at).toBe(42);
      expect(res.value.metrics).toMatchObject({
        host: '192.168.1.50',
        cpuLoad: 1.23,
        cpuTemp: 55.2,
        diskTotal: 488245288 * 1024,
        diskUsagePercent: 3,
      });
      expect(typeof res.value.metrics.uptime).toBe('number');
      expect(res.value.metrics.uptime).toBeGreaterThan(0);
    }
    expect(calls.map((c) => c.command)).toEqual(
      expect.arrayContaining(['uptime', 'df -k /', TEMP_CMD]),
    );
    expect(calls[0]?.user).toBe('me');
    expect(calls[0]?.privateKeyPath).toBe('/tmp/id_rsa');
  });

  it('getStats tolerates missing temp binary', async () => {
    const svc = new MacMiniService({
      ping: fakePing({ success: true }),
      ssh: fakeSsh({
        uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
        'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
        [TEMP_CMD]: { stdout: '', stderr: 'not found', code: 1 },
      }),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.cpuTemp).toBe(0);
  });

  it('getStats maps ssh failure to UnavailableError', async () => {
    const svc = new MacMiniService({
      ping: fakePing({ success: true }),
      ssh: {
        exec: async () => {
          throw new Error('connection refused');
        },
      },
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });

  it('getStats maps non-zero uptime exit to UnavailableError', async () => {
    const svc = new MacMiniService({
      ping: fakePing({ success: true }),
      ssh: fakeSsh({
        uptime: { stdout: '', stderr: 'nope', code: 1 },
        'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
        [TEMP_CMD]: { stdout: '', stderr: '', code: 1 },
      }),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });
});
