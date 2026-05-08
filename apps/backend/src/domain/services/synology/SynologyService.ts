import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { withHostPing } from '../../health.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, UnauthorizedError, isDomainError } from '../../../core/errors.js';
import type { SynologyInstance } from '../../../config/services.js';
import type { SnmpGetter, SnmpV3Credentials } from '../../../infra/snmp/snmpGetter.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { DsmClient } from '../../../infra/synology/dsmClient.js';

export interface SynologyDeps {
  snmp: SnmpGetter;
  ping: PingProber;
  config: SynologyInstance;
  dsm?: DsmClient;
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

interface DsmInfoData { model?: string; version?: string; temperature?: number }
interface SysStatusData { cpu_fan_status?: string; sys_fan_status?: string; power_status?: string }
interface StorageVolume { status: string }
interface StorageDisk { status: string }
interface StorageData { volumes?: StorageVolume[]; disks?: StorageDisk[] }

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
  private readonly pinger: PingProber;
  private readonly dsm: DsmClient | undefined;
  private readonly now: () => number;

  constructor(deps: SynologyDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.timeoutMs = deps.config.timeoutMs;
    this.snmp = deps.snmp;
    this.pinger = deps.ping;
    this.dsm = deps.dsm;
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
    return withHostPing(
      { host: this.host, timeoutMs: this.timeoutMs, pingCount: 1, prober: this.pinger },
      async (sig) => {
        if (!this.credentialsReady) {
          return {
            reachable: false,
            message: 'snmp credentials not configured',
            details: { host: this.host, credentialsConfigured: false },
          };
        }
        const started = this.now();
        try {
          const res = await this.snmp.get({
            host: this.host,
            oids: HEALTH_OIDS,
            credentials: this.credentials,
            timeoutMs: this.timeoutMs,
            signal: sig,
          });
          const values = res.values;
          return {
            reachable: true,
            latencyMs: this.now() - started,
            details: {
              host: this.host,
              credentialsConfigured: true,
              systemName: clean(values[0]) || 'Unknown',
              systemModel: clean(values[2]) || 'Unknown',
              systemVersion: clean(values[3]) || 'Unknown',
            },
          };
        } catch (e) {
          return {
            reachable: false,
            message: e instanceof Error ? e.message : String(e),
            details: { host: this.host, credentialsConfigured: true },
          };
        }
      },
      this.now(),
      signal,
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    if (!this.credentialsReady) {
      return err(new UnauthorizedError('synology snmp credentials not configured'));
    }
    try {
      const [snmpResult, dsmInfoResult, sysStatusResult, storageResult] = await Promise.allSettled([
        this.snmp.get({
          host: this.host,
          oids: ALL_OIDS,
          credentials: this.credentials,
          timeoutMs: this.timeoutMs,
          signal,
        }),
        this.dsm?.call<DsmInfoData>('SYNO.DSM.Info', 1, 'get', {}, signal) ?? Promise.resolve(null),
        this.dsm?.call<SysStatusData>('SYNO.Core.System.Status', 1, 'get', {}, signal) ?? Promise.resolve(null),
        this.dsm?.call<StorageData>('SYNO.Storage.CGI.Storage', 1, 'load_info', {}, signal) ?? Promise.resolve(null),
      ]);

      if (snmpResult.status === 'rejected') throw snmpResult.reason as unknown;

      const v = snmpResult.value.values.map(clean);
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

      const dsmInfo = dsmInfoResult.status === 'fulfilled' ? dsmInfoResult.value : null;
      const sysStatus = sysStatusResult.status === 'fulfilled' ? sysStatusResult.value : null;
      const storage = storageResult.status === 'fulfilled' ? storageResult.value : null;

      const volumes = storage?.volumes ?? null;
      const disks = storage?.disks ?? null;

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
          ...(dsmInfo !== null ? {
            dsmModel: dsmInfo.model ?? '',
            dsmVersion: dsmInfo.version ?? '',
            dsmTemperature: dsmInfo.temperature ?? 0,
          } : {}),
          ...(sysStatus !== null ? {
            cpuFanStatus: sysStatus.cpu_fan_status ?? '',
            sysFanStatus: sysStatus.sys_fan_status ?? '',
            powerStatus: sysStatus.power_status ?? '',
          } : {}),
          ...(volumes !== null ? {
            volumeCount: volumes.length,
            volumeDegradedCount: volumes.filter((vol) => vol.status !== 'normal').length,
          } : {}),
          ...(disks !== null ? {
            diskCount: disks.length,
            diskDegradedCount: disks.filter((d) => d.status !== 'normal').length,
          } : {}),
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
