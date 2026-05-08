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
const SMART_CMD = 'which smartctl >/dev/null 2>&1 && smartctl -j -a disk0 2>/dev/null || true';

const VM_STAT_OUT = [
  'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
  'Pages free:                            10000.',
  'Pages active:                          20000.',
  'Pages inactive:                        15000.',
  'Pages speculative:                      5000.',
  'Pages wired down:                      12000.',
  'Pages occupied by compressor:           3000.',
].join('\n');

const PMSET_AC_OUT = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=3407872)\t100%; charged; 0:00 remaining present: true\n";
const PMSET_DESKTOP_OUT = "Now drawing from 'AC Power'\n";
const PMSET_BATT_OUT = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=3407872)\t72%; discharging; 3:14 remaining present: true\n";

const TOP_OUT = [
  'Processes: 350 total, 5 running, 345 sleeping, 1600 threads',
  'Load Avg: 1.85, 1.42, 1.36',
  'CPU usage: 12.25% user, 4.12% sys, 83.63% idle',
  'SharedLibs: 400M resident, 60M data, 20M linkedit.',
].join('\n');

const IFCONFIG_OUT = [
  'en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500',
  '\tether aa:bb:cc:dd:ee:ff',
  '\tinet 192.168.1.100 netmask 0xffffff00 broadcast 192.168.1.255',
  '\tstatus: active',
].join('\n');

const SMART_OUT = JSON.stringify({
  smart_status: { passed: true },
  temperature: { current: 42 },
  model_name: 'APPLE SSD AP0512R',
});

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

  describe('extended metrics', () => {
    it('parses memory from vm_stat', async () => {
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh({
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          'vm_stat': { stdout: VM_STAT_OUT, stderr: '', code: 0 },
        }),
        config: makeConfig(),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const m = res.value.metrics as Record<string, unknown>;
      expect(m['memWiredBytes']).toBe(12000 * 16384);
      expect(m['memActiveBytes']).toBe(20000 * 16384);
      expect(m['memInactiveBytes']).toBe(15000 * 16384);
      expect(m['memFreeBytes']).toBe(10000 * 16384);
      expect(m['memTotalBytes']).toBe((20000 + 15000 + 12000 + 3000 + 10000 + 5000) * 16384);
    });

    it('parses power state from pmset (AC + battery)', async () => {
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh({
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          'pmset -g batt': { stdout: PMSET_AC_OUT, stderr: '', code: 0 },
        }),
        config: makeConfig(),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const m = res.value.metrics as Record<string, unknown>;
      expect(m['onAC']).toBe(true);
      expect(m['batteryPercent']).toBe(100);
      expect(m['batteryCharging']).toBe(false); // "charged" not "charging"
    });

    it('parses power state from pmset (desktop AC only)', async () => {
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh({
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          'pmset -g batt': { stdout: PMSET_DESKTOP_OUT, stderr: '', code: 0 },
        }),
        config: makeConfig(),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const m = res.value.metrics as Record<string, unknown>;
      expect(m['onAC']).toBe(true);
      expect(m['batteryPercent']).toBeNull();
    });

    it('parses power state from pmset (discharging battery)', async () => {
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh({
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          'pmset -g batt': { stdout: PMSET_BATT_OUT, stderr: '', code: 0 },
        }),
        config: makeConfig(),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const m = res.value.metrics as Record<string, unknown>;
      expect(m['onAC']).toBe(false);
      expect(m['batteryPercent']).toBe(72);
      expect(m['batteryCharging']).toBe(false);
    });

    it('parses CPU% and process count from top', async () => {
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh({
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          'top -l 1 -n 0 -s 0': { stdout: TOP_OUT, stderr: '', code: 0 },
        }),
        config: makeConfig(),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const m = res.value.metrics as Record<string, unknown>;
      expect(m['cpuUser']).toBe(12.25);
      expect(m['cpuSys']).toBe(4.12);
      expect(m['cpuIdle']).toBe(83.63);
      expect(m['processCount']).toBe(350);
    });

    it('parses IP and interface state from ifconfig', async () => {
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh({
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          'ifconfig en0': { stdout: IFCONFIG_OUT, stderr: '', code: 0 },
        }),
        config: makeConfig(),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const m = res.value.metrics as Record<string, unknown>;
      expect(m['ipAddress']).toBe('192.168.1.100');
      expect(m['interfaceUp']).toBe(true);
    });

    it('parses SMART health and disk temp from smartctl JSON', async () => {
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh({
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          [SMART_CMD]: { stdout: SMART_OUT, stderr: '', code: 0 },
        }),
        config: makeConfig(),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const m = res.value.metrics as Record<string, unknown>;
      expect(m['smartPassed']).toBe(true);
      expect(m['diskTemp']).toBe(42);
      expect(m['diskModel']).toBe('APPLE SSD AP0512R');
    });

    it('returns null extended fields when commands fail or are absent', async () => {
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh({
          uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
          'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
        }),
        config: makeConfig(),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const m = res.value.metrics as Record<string, unknown>;
      expect(m['memWiredBytes']).toBeNull();
      expect(m['memActiveBytes']).toBeNull();
      expect(m['onAC']).toBeNull();
      expect(m['batteryPercent']).toBeNull();
      expect(m['cpuUser']).toBeNull();
      expect(m['processCount']).toBeNull();
      expect(m['ipAddress']).toBeNull();
      expect(m['interfaceUp']).toBeNull();
      expect(m['smartPassed']).toBeNull();
      expect(m['diskTemp']).toBeNull();
    });

    it('all extended commands run in parallel with core commands', async () => {
      const calls: SshExecRequest[] = [];
      const svc = new MacMiniService({
        ping: fakePing({ success: true }),
        ssh: fakeSsh(
          {
            uptime: { stdout: UPTIME_OUT, stderr: '', code: 0 },
            'df -k /': { stdout: DF_OUT, stderr: '', code: 0 },
          },
          calls,
        ),
        config: makeConfig(),
        now: () => 0,
      });
      await svc.getStats(new AbortController().signal);
      const commands = calls.map((c) => c.command);
      expect(commands).toEqual(
        expect.arrayContaining([
          'uptime',
          'df -k /',
          TEMP_CMD,
          'vm_stat',
          'pmset -g batt',
          'top -l 1 -n 0 -s 0',
          'ifconfig en0',
          SMART_CMD,
        ]),
      );
    });
  });
});
