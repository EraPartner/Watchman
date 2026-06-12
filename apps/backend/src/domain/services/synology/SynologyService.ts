import {
  BaseService,
  type HealthResult,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { withHostPing } from "../../health.js";
import { ok, err } from "../../../core/result.js";
import {
  UnavailableError,
  UnauthorizedError,
  isDomainError,
} from "../../../core/errors.js";
import type { SynologyInstance } from "../../../config/services.js";
import type {
  SnmpGetter,
  SnmpV3Credentials,
} from "../../../infra/snmp/snmpGetter.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type { DsmClient } from "../../../infra/synology/dsmClient.js";

export interface SynologyDeps {
  snmp: SnmpGetter;
  ping: PingProber;
  config: SynologyInstance;
  dsm?: DsmClient;
  now: () => number;
}

const OIDS = {
  systemName: "1.3.6.1.2.1.1.5.0",
  systemUptime: "1.3.6.1.2.1.1.3.0",
  systemModel: "1.3.6.1.4.1.6574.1.5.1.0",
  systemVersion: "1.3.6.1.4.1.6574.1.5.3.0",
  systemStatus: "1.3.6.1.4.1.6574.1.1.0",
  cpuUsage: "1.3.6.1.4.1.6574.1.5.2.0",
  cpuTemp: "1.3.6.1.4.1.6574.1.2.0",
  memoryTotal: "1.3.6.1.4.1.6574.1.5.4.0",
  memoryAvailable: "1.3.6.1.4.1.6574.1.5.5.0",
  memoryUsage: "1.3.6.1.4.1.6574.1.5.6.0",
  diskTotal: "1.3.6.1.4.1.6574.2.1.1.4.0",
  diskUsed: "1.3.6.1.4.1.6574.2.1.1.5.0",
  diskUsage: "1.3.6.1.4.1.6574.2.1.1.6.0",
  // 32-bit per-interface counters (wrap at 4 GiB) — fallback only
  networkRx: "1.3.6.1.2.1.2.2.1.10.1",
  networkTx: "1.3.6.1.2.1.2.2.1.16.1",
} as const;

// 64-bit ifXTable counters for ifIndex=1 (no 4 GiB wrap)
const HC_NET_OIDS: readonly string[] = [
  "1.3.6.1.2.1.31.1.1.1.6.1",
  "1.3.6.1.2.1.31.1.1.1.10.1",
];

interface DsmInfoData {
  model?: string;
  version?: string;
  temperature?: number;
}
interface SysStatusData {
  cpu_fan_status?: string;
  sys_fan_status?: string;
  power_status?: string;
}
interface StorageVolume {
  status: string;
  size?: { total?: number | string; used?: number | string };
}
interface StorageDisk {
  status: string;
}
interface UtilizationData {
  cpu?: { user_load?: number; system_load?: number; other_load?: number };
  memory?: { real_usage?: number };
  network?: Array<{ device?: string; rx?: number; tx?: number }>;
}
interface StorageData {
  volumes?: StorageVolume[];
  disks?: StorageDisk[];
}

const HEALTH_OIDS: readonly string[] = [
  OIDS.systemName,
  OIDS.systemUptime,
  OIDS.systemModel,
  OIDS.systemVersion,
  OIDS.systemStatus,
];

const ALL_OIDS: readonly string[] = Object.values(OIDS);

export class SynologyService extends BaseService {
  readonly kind = "synology";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly snmp: SnmpGetter;
  private readonly credentials: SnmpV3Credentials;
  private readonly pinger: PingProber;
  private readonly dsm: DsmClient | undefined;
  private readonly now: () => number;
  // last cumulative network counters, for computing byte rates between polls
  private lastNet: { at: number; rx: number; tx: number } | null = null;

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
    return Boolean(
      this.credentials.user &&
      this.credentials.authKey &&
      this.credentials.privKey
    );
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    return withHostPing(
      {
        host: this.host,
        timeoutMs: this.timeoutMs,
        pingCount: 1,
        prober: this.pinger,
      },
      async (sig) => {
        if (!this.credentialsReady) {
          return {
            reachable: false,
            message: "snmp credentials not configured",
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
              systemName: clean(values[0]) || "Unknown",
              systemModel: clean(values[2]) || "Unknown",
              systemVersion: clean(values[3]) || "Unknown",
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
      signal
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    const dsmConfigured = this.dsm !== undefined;
    if (!this.credentialsReady && !dsmConfigured) {
      return err(
        new UnauthorizedError(
          "synology snmp credentials (or dsm credentials) not configured"
        )
      );
    }
    try {
      // DSM-only mode: stats work without SNMPv3 setup when DSM creds exist
      const snmpUnavailable = (): Promise<never> =>
        Promise.reject(new UnavailableError("snmp not configured"));
      const [
        snmpResult,
        hcNetResult,
        utilizationResult,
        dsmInfoResult,
        sysStatusResult,
        storageResult,
      ] = await Promise.allSettled([
        this.credentialsReady
          ? this.snmp.get({
              host: this.host,
              oids: ALL_OIDS,
              credentials: this.credentials,
              timeoutMs: this.timeoutMs,
              signal,
            })
          : snmpUnavailable(),
        this.credentialsReady
          ? this.snmp.get({
              host: this.host,
              oids: HC_NET_OIDS,
              credentials: this.credentials,
              timeoutMs: this.timeoutMs,
              signal,
            })
          : snmpUnavailable(),
        this.dsm?.call<UtilizationData>(
          "SYNO.Core.System.Utilization",
          1,
          "get",
          {},
          signal
        ) ?? Promise.resolve(null),
        this.dsm?.call<DsmInfoData>("SYNO.DSM.Info", 1, "get", {}, signal) ??
          Promise.resolve(null),
        this.dsm?.call<SysStatusData>(
          "SYNO.Core.System.Status",
          1,
          "get",
          {},
          signal
        ) ?? Promise.resolve(null),
        this.dsm?.call<StorageData>(
          "SYNO.Storage.CGI.Storage",
          1,
          "load_info",
          {},
          signal
        ) ?? Promise.resolve(null),
      ]);

      // SNMP failure is fatal only when SNMP is the configured source
      if (snmpResult.status === "rejected" && this.credentialsReady) {
        throw snmpResult.reason as unknown;
      }
      const snmpOk = snmpResult.status === "fulfilled";

      const v = snmpOk ? snmpResult.value.values.map(clean) : [];
      const uptimeTicks = toInt(v[1]);
      const cpuTemp = toInt(v[6]);
      const memoryTotalMB = toInt(v[7]);
      const memoryAvailableMB = toInt(v[8]);
      const diskTotalKB = toInt(v[10]);
      const diskUsedKB = toInt(v[11]);

      const utilization =
        utilizationResult.status === "fulfilled"
          ? utilizationResult.value
          : null;
      const utilCpu = utilization?.cpu
        ? (utilization.cpu.user_load ?? 0) +
          (utilization.cpu.system_load ?? 0) +
          (utilization.cpu.other_load ?? 0)
        : null;
      const utilMem = utilization?.memory?.real_usage ?? null;
      const utilNet =
        utilization?.network?.find((n) => n.device === "total") ??
        utilization?.network?.[0] ??
        null;

      const cpuUsage = snmpOk ? toInt(v[5]) : (utilCpu ?? 0);
      const memoryUsagePercent = snmpOk ? toInt(v[9]) : (utilMem ?? 0);

      // Prefer 64-bit HC counters; fall back to the 32-bit values from the
      // main get when the device doesn't expose ifXTable
      let networkRx = toInt(v[13]);
      let networkTx = toInt(v[14]);
      if (hcNetResult.status === "fulfilled") {
        const hc = hcNetResult.value.values.map(clean);
        const hcRx = toInt(hc[0]);
        const hcTx = toInt(hc[1]);
        if (hcRx > 0 || hcTx > 0) {
          networkRx = hcRx;
          networkTx = hcTx;
        }
      }

      // Byte rates between polls; negative deltas (wrap/reboot) are skipped
      const at = this.now();
      let networkRxBps: number | undefined;
      let networkTxBps: number | undefined;
      if (snmpOk) {
        if (this.lastNet && at > this.lastNet.at) {
          const dtSec = (at - this.lastNet.at) / 1000;
          const dRx = networkRx - this.lastNet.rx;
          const dTx = networkTx - this.lastNet.tx;
          if (dRx >= 0 && dTx >= 0) {
            networkRxBps = Math.round(dRx / dtSec);
            networkTxBps = Math.round(dTx / dtSec);
          }
        }
        this.lastNet = { at, rx: networkRx, tx: networkTx };
      }

      const memoryTotal = memoryTotalMB * 1024 * 1024;
      const memoryAvailable = memoryAvailableMB * 1024 * 1024;
      const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);

      const dsmInfo =
        dsmInfoResult.status === "fulfilled" ? dsmInfoResult.value : null;
      const sysStatus =
        sysStatusResult.status === "fulfilled" ? sysStatusResult.value : null;
      const storage =
        storageResult.status === "fulfilled" ? storageResult.value : null;

      const volumes = storage?.volumes ?? null;
      const disks = storage?.disks ?? null;

      // Disk totals: prefer DSM volume sizes (covers every volume) over the
      // single-volume SNMP scalars
      let diskTotal = diskTotalKB * 1024;
      let diskUsed = diskUsedKB * 1024;
      let diskUsagePercent = toInt(v[12]);
      const volumeSizes = (volumes ?? [])
        .map((vol) => ({
          total: toNum(vol.size?.total),
          used: toNum(vol.size?.used),
        }))
        .filter((s) => s.total > 0);
      if (volumeSizes.length > 0) {
        diskTotal = volumeSizes.reduce((sum, s) => sum + s.total, 0);
        diskUsed = volumeSizes.reduce((sum, s) => sum + s.used, 0);
        diskUsagePercent =
          diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;
      }
      const diskFree = Math.max(0, diskTotal - diskUsed);

      return ok({
        at: this.now(),
        metrics: {
          host: this.host,
          systemName: v[0] ?? "",
          systemModel: v[2] ?? "",
          systemVersion: v[3] ?? "",
          systemStatus: snmpOk
            ? toInt(v[4]) === 1
              ? "Normal"
              : "Warning"
            : "Unknown",
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
          ...(networkRxBps !== undefined ? { networkRxBps } : {}),
          ...(networkTxBps !== undefined ? { networkTxBps } : {}),
          ...(utilization !== null
            ? {
                dsmCpuLoad: utilCpu ?? 0,
                dsmMemUsagePercent: utilMem ?? 0,
                // raw utilization network counters, units as reported by DSM
                ...(utilNet
                  ? { dsmNetRx: utilNet.rx ?? 0, dsmNetTx: utilNet.tx ?? 0 }
                  : {}),
              }
            : {}),
          ...(dsmInfo !== null
            ? {
                dsmModel: dsmInfo.model ?? "",
                dsmVersion: dsmInfo.version ?? "",
                dsmTemperature: dsmInfo.temperature ?? 0,
              }
            : {}),
          ...(sysStatus !== null
            ? {
                cpuFanStatus: sysStatus.cpu_fan_status ?? "",
                sysFanStatus: sysStatus.sys_fan_status ?? "",
                powerStatus: sysStatus.power_status ?? "",
              }
            : {}),
          ...(volumes !== null
            ? {
                volumeCount: volumes.length,
                volumeDegradedCount: volumes.filter(
                  (vol) => vol.status !== "normal"
                ).length,
              }
            : {}),
          ...(disks !== null
            ? {
                diskCount: disks.length,
                diskDegradedCount: disks.filter((d) => d.status !== "normal")
                  .length,
              }
            : {}),
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`synology stats failed: ${msg}`));
    }
  }
}

function clean(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/^"(.*)"$/, "$1").trim();
}

function toNum(raw: number | string | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toInt(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}
