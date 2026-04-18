import { describe, it, expect } from 'vitest';
import { SynologyService } from './SynologyService.js';
import { UnauthorizedError, UnavailableError } from '../../../core/errors.js';
import type { SnmpGetter, SnmpGetRequest, SnmpGetResult } from '../../../infra/snmp/snmpGetter.js';
import type { SynologyInstance } from '../../../config/services.js';

function makeConfig(overrides: Partial<SynologyInstance> = {}): SynologyInstance {
  return {
    kind: 'synology',
    instanceId: 'main',
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: '192.168.1.10',
    snmpUser: 'u',
    snmpAuthKey: 'a'.repeat(8),
    snmpPrivKey: 'p'.repeat(8),
    snmpAuthProtocol: 'SHA',
    snmpPrivProtocol: 'AES',
    ...overrides,
  };
}

function fakeSnmp(
  fn: (req: SnmpGetRequest) => SnmpGetResult | Promise<SnmpGetResult>,
  calls: SnmpGetRequest[] = [],
): SnmpGetter {
  return {
    get: async (req) => {
      calls.push(req);
      return fn(req);
    },
  };
}

describe('SynologyService', () => {
  it('id is synology:main', () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe('synology:main');
  });

  it('checkHealth reachable when snmp succeeds', async () => {
    let n = 0;
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({
        values: ['"DS920"', '123456', '"DS920+"', '"DSM 7.2"', '1'],
      })),
      config: makeConfig(),
      now: () => (n += 5),
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.systemName).toBe('DS920');
      expect(res.value.details?.systemModel).toBe('DS920+');
      expect(typeof res.value.latencyMs).toBe('number');
    }
  });

  it('checkHealth unreachable when creds missing', async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig({ snmpUser: '', snmpAuthKey: '', snmpPrivKey: '' }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(false);
      expect(res.value.details?.credentialsConfigured).toBe(false);
    }
  });

  it('checkHealth unreachable when snmp throws', async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => {
        throw new Error('timeout');
      }),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(false);
      expect(res.value.message).toBe('timeout');
    }
  });

  it('getStats returns UnauthorizedError when creds missing', async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig({ snmpUser: '' }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnauthorizedError);
  });

  it('getStats parses all metrics', async () => {
    const calls: SnmpGetRequest[] = [];
    const values = [
      '"DS920"', // systemName
      '500000', // uptime ticks -> 5000 seconds
      '"DS920+"', // systemModel
      '"DSM 7.2"', // systemVersion
      '1', // systemStatus Normal
      '37', // cpuUsage
      '42', // cpuTemp
      '8192', // memoryTotal MB
      '2048', // memoryAvailable MB
      '75', // memoryUsagePercent
      '10000000', // diskTotal KB
      '4000000', // diskUsed KB
      '40', // diskUsagePercent
      '123456789', // networkRx
      '987654321', // networkTx
    ];
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values }), calls),
      config: makeConfig(),
      now: () => 42,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.at).toBe(42);
      expect(res.value.metrics).toMatchObject({
        host: '192.168.1.10',
        systemName: 'DS920',
        systemModel: 'DS920+',
        systemVersion: 'DSM 7.2',
        systemStatus: 'Normal',
        uptime: 5000,
        cpuUsage: 37,
        cpuTemp: 42,
        memoryTotal: 8192 * 1024 * 1024,
        memoryAvailable: 2048 * 1024 * 1024,
        memoryUsed: (8192 - 2048) * 1024 * 1024,
        memoryUsagePercent: 75,
        diskTotal: 10_000_000 * 1024,
        diskUsed: 4_000_000 * 1024,
        diskFree: 6_000_000 * 1024,
        diskUsagePercent: 40,
        networkRx: 123456789,
        networkTx: 987654321,
      });
    }
    expect(calls[0]?.credentials.user).toBe('u');
    expect(calls[0]?.credentials.authProtocol).toBe('SHA');
    expect(calls[0]?.oids.length).toBe(15);
  });

  it('getStats reports Warning when systemStatus != 1', async () => {
    const values = Array.from({ length: 15 }, (_, i) => (i === 4 ? '2' : '0'));
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values })),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.systemStatus).toBe('Warning');
  });

  it('getStats maps snmp failure to UnavailableError', async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => {
        throw new Error('snmpget exit 1');
      }),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });
});
