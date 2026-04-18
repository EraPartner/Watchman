import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, UnauthorizedError, isDomainError } from '../../../core/errors.js';
import type { SynologyInstance } from '../../../config/services.js';
import type { SnmpGetter, SnmpV3Credentials } from '../../../infra/snmp/snmpGetter.js';

export interface SynologyDeps {
  snmp: SnmpGetter;
  config: SynologyInstance;
  now: () => number;
}

const OIDS = {
  systemName: '1.3.6.1.2.1.1.5.0',
  systemUptime: '1.3.6.1.2.1.1.3.0',
  systemModel: '1.3.6.1.4.1.6574.1.5.1.0',
  systemVersion: '1.3.6.1.4.1.6574.1.5.3.0',
  systemStatus: '1.3.6.1.4.1.6574.1.1.0',
  cpuUsage: '1.3.6.1.4.1.6574.1.5.2.0',
  cpuTemp: '1.3.6.1.4.1.6574.1.2.0',
  memoryTotal: '1.3.6.1.4.1.6574.1.5.4.0',
  memoryAvailable: '1.3.6.1.4.1.6574.1.5.5.0',
  memoryUsage: '1.3.6.1.4.1.6574.1.5.6.0',
  diskTotal: '1.3.6.1.4.1.6574.2.1.1.4.0',
  diskUsed: '1.3.6.1.4.1.6574.2.1.1.5.0',
  diskUsage: '1.3.6.1.4.1.6574.2.1.1.6.0',
  networkRx: '1.3.6.1.2.1.2.2.1.10.1',
  networkTx: '1.3.6.1.2.1.2.2.1.16.1',
} as const;

const HEALTH_OIDS: readonly string[] = [
  OIDS.systemName,
  OIDS.systemUptime,
  OIDS.systemModel,
  OIDS.systemVersion,
  OIDS.systemStatus,
];

const ALL_OIDS: readonly string[] = Object.values(OIDS);

export class SynologyService extends BaseService {
  readonly kind = 'synology';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly snmp: SnmpGetter;
  private readonly credentials: SnmpV3Credentials;
  private readonly now: () => number;

  constructor(deps: SynologyDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.timeoutMs = deps.config.timeoutMs;
    this.snmp = deps.snmp;
    this.credentials = {
      user: deps.config.snmpUser,
      authKey: deps.config.snmpAuthKey,
      privKey: deps.config.snmpPrivKey,
      authProtocol: deps.config.snmpAuthProtocol,
      privProtocol: deps.config.snmpPrivProtocol,
    };
    this.now = deps.now;
  }

  private get credentialsReady(): boolean {
    return Boolean(this.credentials.user && this.credentials.authKey && this.credentials.privKey);
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    if (!this.credentialsReady) {
      return ok({
        reachable: false,
        message: 'snmp credentials not configured',
        at: this.now(),
        details: { host: this.host, credentialsConfigured: false },
      });
    }
    const started = this.now();
    try {
      const res = await this.snmp.get({
        host: this.host,
        oids: HEALTH_OIDS,
        credentials: this.credentials,
        timeoutMs: this.timeoutMs,
        signal,
      });
      const values = res.values;
      return ok({
        reachable: true,
        latencyMs: this.now() - started,
        at: this.now(),
        details: {
          host: this.host,
          credentialsConfigured: true,
          systemName: clean(values[0]) || 'Unknown',
          systemModel: clean(values[2]) || 'Unknown',
          systemVersion: clean(values[3]) || 'Unknown',
        },
      });
    } catch (e) {
      return ok({
        reachable: false,
        message: e instanceof Error ? e.message : String(e),
        at: this.now(),
        details: { host: this.host, credentialsConfigured: true },
      });
    }
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    if (!this.credentialsReady) {
      return err(new UnauthorizedError('synology snmp credentials not configured'));
    }
    try {
      const res = await this.snmp.get({
        host: this.host,
        oids: ALL_OIDS,
        credentials: this.credentials,
        timeoutMs: this.timeoutMs,
        signal,
      });
      const v = res.values.map(clean);
      const uptimeTicks = toInt(v[1]);
      const cpuUsage = toInt(v[5]);
      const cpuTemp = toInt(v[6]);
      const memoryTotalMB = toInt(v[7]);
      const memoryAvailableMB = toInt(v[8]);
      const memoryUsagePercent = toInt(v[9]);
      const diskTotalKB = toInt(v[10]);
      const diskUsedKB = toInt(v[11]);
      const diskUsagePercent = toInt(v[12]);
      const networkRx = toInt(v[13]);
      const networkTx = toInt(v[14]);

      const memoryTotal = memoryTotalMB * 1024 * 1024;
      const memoryAvailable = memoryAvailableMB * 1024 * 1024;
      const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);
      const diskTotal = diskTotalKB * 1024;
      const diskUsed = diskUsedKB * 1024;
      const diskFree = Math.max(0, diskTotal - diskUsed);

      return ok({
        at: this.now(),
        metrics: {
          host: this.host,
          systemName: v[0] ?? '',
          systemModel: v[2] ?? '',
          systemVersion: v[3] ?? '',
          systemStatus: toInt(v[4]) === 1 ? 'Normal' : 'Warning',
          uptime: uptimeTicks / 100,
          cpuUsage,
          cpuTemp,
          memoryTotal,
          memoryAvailable,
          memoryUsed,
          memoryUsagePercent,
          diskTotal,
          diskUsed,
          diskFree,
          diskUsagePercent,
          networkRx,
          networkTx,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`synology snmp failed: ${msg}`));
    }
  }
}

function clean(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/^"(.*)"$/, '$1').trim();
}

function toInt(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}
