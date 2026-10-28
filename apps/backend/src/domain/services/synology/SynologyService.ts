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

// SYNOLOGY-SYSTEM-MIB (1.3.6.1.4.1.6574.1) has no CPU, memory or volume-size
// scalars: .1.5.2 is serialNumber and .1.5.4 is upgradeAvailable. CPU and
// memory come from UCD-SNMP-MIB, which Synology's MIB guide lists for DSM.
const OIDS = {
  systemName: "1.3.6.1.2.1.1.5.0",
  // hrSystemUptime: host uptime (sysUpTime is the SNMP agent's own uptime)
  systemUptime: "1.3.6.1.2.1.25.1.1.0",
  systemModel: "1.3.6.1.4.1.6574.1.5.1.0",
  systemVersion: "1.3.6.1.4.1.6574.1.5.3.0",
  systemStatus: "1.3.6.1.4.1.6574.1.1.0",
  cpuIdle: "1.3.6.1.4.1.2021.11.11.0", // ssCpuIdle, %
  cpuTemp: "1.3.6.1.4.1.6574.1.2.0",
  memoryTotal: "1.3.6.1.4.1.2021.4.5.0", // memTotalReal, kB
  memoryFree: "1.3.6.1.4.1.2021.4.6.0", // memAvailReal, kB
  memoryBuffer: "1.3.6.1.4.1.2021.4.14.0", // memBuffer, kB
  memoryCached: "1.3.6.1.4.1.2021.4.15.0", // memCached, kB
  sysUpTime: "1.3.6.1.2.1.1.3.0", // fallback when hrSystemUptime is absent
} as const;

// Interface counters are walked, not read at ifIndex=1: on Linux (DSM)
// ifIndex 1 is the loopback interface.
const NET_WALK = {
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  // 64-bit ifXTable counters (no 4 GiB wrap)
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6",
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10",
  // 32-bit counters (wrap at 4 GiB) — fallback only
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",
} as const;

type WalkRows = ReadonlyArray<{ oid: string; value: string }>;

/** Summed octet counters and which counter family they came from. Rates are
 *  only computed between two samples of the same kind: a 64-bit total minus a
 *  32-bit one is not a byte count. */
interface NetSample {
  kind: "hc" | "32";
  rx: number;
  tx: number;
}

interface DsmInfoData {
  model?: string;
  version?: string;
  version_string?: string;
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
  private lastNet: (NetSample & { at: number }) | null = null;

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
        if (!this.credentialsReady && this.dsm) {
          return this.probeDsm(sig);
        }
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

  /** DSM-only mode (no SNMPv3 credentials): DSM is the only data source, so it
   *  defines health. SYNO.DSM.Info getinfo is the same read getStats makes. */
  private async probeDsm(sig: AbortSignal): Promise<{
    reachable: boolean;
    latencyMs?: number;
    message?: string;
    details: Record<string, unknown>;
  }> {
    const started = this.now();
    try {
      const info = await this.dsm!.call<DsmInfoData>(
        "SYNO.DSM.Info",
        1,
        "getinfo",
        {},
        sig
      );
      return {
        reachable: true,
        latencyMs: this.now() - started,
        details: {
          host: this.host,
          credentialsConfigured: false,
          source: "dsm",
          systemModel: info?.model || "Unknown",
          systemVersion: info?.version_string ?? info?.version ?? "Unknown",
        },
      };
    } catch (e) {
      return {
        reachable: false,
        message: e instanceof Error ? e.message : String(e),
        details: { host: this.host, credentialsConfigured: false, source: "dsm" },
      };
    }
  }

  /**
   * Sums octet counters over the NAS's external interfaces. Returns null when
   * a walk it depends on failed or came back empty, so a partial sample is
   * never reported as traffic or used as a rate baseline.
   */
  private async walkNetwork(signal: AbortSignal): Promise<NetSample | null> {
    const walk = (subtree: string): Promise<WalkRows | null> =>
      this.snmp
        .walk({
          host: this.host,
          subtree,
          v3: this.credentials,
          timeoutMs: this.timeoutMs,
          signal,
        })
        .then((r) => r.rows)
        .catch(() => null);
    const [descr, hcIn, hcOut, in32, out32] = await Promise.all([
      walk(NET_WALK.ifDescr),
      walk(NET_WALK.ifHCInOctets),
      walk(NET_WALK.ifHCOutOctets),
      walk(NET_WALK.ifInOctets),
      walk(NET_WALK.ifOutOctets),
    ]);
    if (!descr || descr.length === 0) return null;
    const names = new Map<string, string>();
    for (const row of descr) names.set(lastArc(row.oid), row.value);
    const selected = selectExternalInterfaces(names);
    if (selected.size === 0) return null;
    const covers = (rows: WalkRows | null): rows is WalkRows =>
      rows !== null && rows.some((r) => selected.has(lastArc(r.oid)));
    const sum = (rows: WalkRows): number =>
      rows.reduce((total, row) => {
        if (!selected.has(lastArc(row.oid))) return total;
        const n = Number(row.value);
        return Number.isFinite(n) ? total + n : total;
      }, 0);
    if (covers(hcIn) && covers(hcOut)) {
      return { kind: "hc", rx: sum(hcIn), tx: sum(hcOut) };
    }
    // an HC walk that failed this time (rather than being absent) would make
    // the 32-bit fallback look like a counter reset; report nothing instead
    if (hcIn === null || hcOut === null) return null;
    if (covers(in32) && covers(out32)) {
      return { kind: "32", rx: sum(in32), tx: sum(out32) };
    }
    return null;
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
        netResult,
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
        this.credentialsReady ? this.walkNetwork(signal) : snmpUnavailable(),
        this.dsm?.call<UtilizationData>(
          "SYNO.Core.System.Utilization",
          1,
          "get",
          {},
          signal
        ) ?? Promise.resolve(null),
        this.dsm?.call<DsmInfoData>(
          "SYNO.DSM.Info",
          1,
          "getinfo",
          {},
          signal
        ) ?? Promise.resolve(null),
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
      // In DSM-only mode DSM is the only source: if every call failed there
      // is no data, and reporting zeros would look like an idle, healthy NAS
      if (!this.credentialsReady) {
        const dsmResults = [
          utilizationResult,
          dsmInfoResult,
          sysStatusResult,
          storageResult,
        ];
        const firstFailure = dsmResults.find((r) => r.status === "rejected");
        if (
          firstFailure &&
          dsmResults.every((r) => r.status === "rejected")
        ) {
          throw (firstFailure as PromiseRejectedResult).reason as unknown;
        }
      }
      const snmpOk = snmpResult.status === "fulfilled";

      const v = snmpOk ? snmpResult.value.values.map(clean) : [];
      const uptimeTicks = toInt(v[1]) || toInt(v[11]);
      const cpuIdle = toOptInt(v[5]);
      const cpuTemp = toInt(v[6]);
      const memoryTotalKB = toInt(v[7]);
      // reclaimable buffers/cache count as available, matching DSM's own
      // "real usage" figure
      const memoryAvailableKB = Math.min(
        memoryTotalKB,
        toInt(v[8]) + toInt(v[9]) + toInt(v[10])
      );

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

      const cpuUsage =
        snmpOk && cpuIdle !== undefined
          ? Math.max(0, 100 - cpuIdle)
          : (utilCpu ?? 0);

      const net = netResult.status === "fulfilled" ? netResult.value : null;

      // Byte rates between polls of the same counter kind; negative deltas
      // (wrap/reboot) are skipped. A missing sample keeps the old baseline.
      const at = this.now();
      let networkRxBps: number | undefined;
      let networkTxBps: number | undefined;
      if (net) {
        if (
          this.lastNet &&
          this.lastNet.kind === net.kind &&
          at > this.lastNet.at
        ) {
          const dtSec = (at - this.lastNet.at) / 1000;
          const dRx = net.rx - this.lastNet.rx;
          const dTx = net.tx - this.lastNet.tx;
          if (dRx >= 0 && dTx >= 0) {
            networkRxBps = Math.round(dRx / dtSec);
            networkTxBps = Math.round(dTx / dtSec);
          }
        }
        this.lastNet = { ...net, at };
      }

      const memoryTotal = memoryTotalKB * 1024;
      const memoryAvailable = memoryAvailableKB * 1024;
      const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);
      const memoryUsagePercent =
        snmpOk && memoryTotal > 0
          ? Math.round((memoryUsed / memoryTotal) * 100)
          : (utilMem ?? 0);

      const dsmInfo =
        dsmInfoResult.status === "fulfilled" ? dsmInfoResult.value : null;
      const sysStatus =
        sysStatusResult.status === "fulfilled" ? sysStatusResult.value : null;
      const storage =
        storageResult.status === "fulfilled" ? storageResult.value : null;

      const volumes = storage?.volumes ?? null;
      const disks = storage?.disks ?? null;

      // Disk totals come from DSM volume sizes only; SNMP has no scalar for
      // them (the SYNOLOGY-DISK-MIB columns are per-disk type/status/temp)
      const volumeSizes = (volumes ?? [])
        .map((vol) => ({
          total: toNum(vol.size?.total),
          used: toNum(vol.size?.used),
        }))
        .filter((s) => s.total > 0);
      const diskTotal = volumeSizes.reduce((sum, s) => sum + s.total, 0);
      const diskUsed = volumeSizes.reduce((sum, s) => sum + s.used, 0);
      const diskUsagePercent =
        diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;
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
          ...(net ? { networkRx: net.rx, networkTx: net.tx } : {}),
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
                dsmVersion: dsmInfo.version_string ?? dsmInfo.version ?? "",
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

function lastArc(oid: string): string {
  return oid.split(".").at(-1) ?? "";
}

const VIRTUAL_IF = /^(lo|docker|veth|br-|sit|tun|tap|dummy)/;

/**
 * Picks the interfaces whose counters represent the NAS's own traffic,
 * avoiding double counting: bonds over their member NICs, Open vSwitch
 * ports (Virtual Machine Manager) over the NICs they wrap, then plain NICs.
 * Loopback and container/tunnel interfaces are always excluded.
 */
export function selectExternalInterfaces(
  names: ReadonlyMap<string, string>
): Set<string> {
  const candidates = [...names].filter(([, n]) => !VIRTUAL_IF.test(n));
  for (const prefix of ["bond", "ovs_", "eth"]) {
    const hit = candidates.filter(([, n]) => n.startsWith(prefix));
    if (hit.length > 0) return new Set(hit.map(([idx]) => idx));
  }
  return new Set(candidates.map(([idx]) => idx));
}

function toOptInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function toInt(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}
