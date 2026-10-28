import {
  BaseService,
  type HealthResult,
  type HostHealth,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { ok } from "../../../core/result.js";
import type { RouterInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type { TcpProber } from "../../../infra/net/tcpProbe.js";
import type { SnmpGetter } from "../../../infra/snmp/snmpGetter.js";

const OID = {
  sysUpTime: "1.3.6.1.2.1.1.3",
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  // 32-bit counters wrap at 4 GiB (seconds on a gigabit link) — used only as
  // a fallback when the 64-bit ifXTable HC counters are unavailable.
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6",
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10",
  arpTable: "1.3.6.1.2.1.4.22.1.2",
  hrProcessorLoad: "1.3.6.1.2.1.25.3.3.1.2",
} as const;

export interface RouterDeps {
  ping: PingProber;
  tcp: TcpProber;
  snmp?: SnmpGetter;
  config: RouterInstance;
  now: () => number;
}

export class RouterService extends BaseService {
  readonly kind = "router";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly host: string;
  private readonly ports: ReadonlyArray<number>;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly interfaceFilter: ReadonlyArray<string>;
  private readonly snmpCommunity: string | undefined;
  private readonly pinger: PingProber;
  private readonly tcp: TcpProber;
  private readonly snmp: SnmpGetter | undefined;
  private readonly now: () => number;
  // last cumulative octet totals, for computing byte rates between polls
  // and the counter family they came from: a 64-bit total minus a 32-bit one
  // is not a byte count, so rates are only taken between samples of one kind
  private lastOctets: {
    at: number;
    kind: "hc" | "32";
    in: number;
    out: number;
  } | null = null;

  constructor(deps: RouterDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.ports = deps.config.ports;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.interfaceFilter = deps.config.interfaceFilter;
    this.snmpCommunity = deps.config.snmpCommunity;
    this.pinger = deps.ping;
    this.tcp = deps.tcp;
    this.snmp = deps.snmp;
    this.now = deps.now;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const pingPromise = this.pinger.probe({
      host: this.host,
      timeoutMs: this.timeoutMs,
      count: this.pingCount,
      signal,
    });
    const portPromises = this.ports.map((port) =>
      this.tcp.probe({
        host: this.host,
        port,
        timeoutMs: this.timeoutMs,
        signal,
      })
    );
    const [pingRes, ...portResults] = await Promise.all([
      pingPromise,
      ...portPromises,
    ]);

    const ports: Record<string, boolean> = {};
    this.ports.forEach((port, i) => {
      ports[String(port)] = Boolean(portResults[i]);
    });

    const anyPortOpen = Object.values(ports).some((v) => v);
    const icmpAlive = pingRes.success;
    const host: HostHealth = {
      reachable: icmpAlive,
      ...(pingRes.avgMs !== undefined ? { pingMs: pingRes.avgMs } : {}),
    };
    const latencyMs = pingRes.avgMs ?? this.now() - started;
    const baseDetails = { icmpAlive, anyPortOpen, ports, host: this.host };

    // No service ports configured → there is no protocol tier to probe. Report
    // a single (host/ICMP) tier so the UI doesn't render a permanently-down
    // "service" indicator for a check that was never set up.
    if (this.ports.length === 0) {
      return ok({
        reachable: icmpAlive,
        latencyMs,
        at: this.now(),
        host,
        details: baseDetails,
      });
    }

    const service = { reachable: anyPortOpen, details: { ports } };
    const reachable = host.reachable || service.reachable;

    return ok({
      reachable,
      latencyMs,
      at: this.now(),
      host,
      service,
      details: baseDetails,
    });
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    const base = {
      host: this.host,
      portCount: this.ports.length,
      configured: Boolean(this.host),
    };

    if (!this.snmpCommunity || !this.snmp) {
      return ok({ at: this.now(), metrics: base });
    }

    const snmpMetrics = await this.collectSnmpMetrics(signal);
    return ok({ at: this.now(), metrics: { ...base, ...snmpMetrics } });
  }

  private async collectSnmpMetrics(
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    try {
      const community = this.snmpCommunity!;
      const v2c = { community };
      const host = this.host;
      const timeoutMs = this.timeoutMs;

      // Each subtree is optional on its own: many routers lack
      // HOST-RESOURCES-MIB (CPU) or time out walking a large ARP table, and
      // that must not discard the other metrics. Only a total failure
      // (wrong community, agent down) yields no SNMP metrics.
      const walk = (
        subtree: string
      ): Promise<ReadonlyArray<{ oid: string; value: string }> | null> =>
        this.snmp!.walk({ host, subtree, v2c, timeoutMs, signal }).then(
          (r) => r.rows,
          () => null
        );
      const results = await Promise.all([
        walk(OID.sysUpTime),
        walk(OID.ifDescr),
        walk(OID.ifInOctets),
        walk(OID.ifOutOctets),
        walk(OID.ifHCInOctets),
        walk(OID.ifHCOutOctets),
        walk(OID.arpTable),
        walk(OID.hrProcessorLoad),
      ] as const);
      if (results.every((r) => r === null)) return {};
      const none: ReadonlyArray<{ oid: string; value: string }> = [];
      const [
        uptimeRows,
        ifDescrRows,
        ifInRows,
        ifOutRows,
        hcInRows,
        hcOutRows,
        arpRows,
        cpuRows,
      ] = results;

      const uptimeRaw = uptimeRows?.[0] ? Number(uptimeRows[0].value) : NaN;
      const sysUptime = Number.isFinite(uptimeRaw) ? uptimeRaw : undefined;

      // a failed ARP walk is "unknown", not zero clients
      const connectedClients = arpRows ? arpRows.length : undefined;

      const cpuLoad =
        cpuRows && cpuRows.length > 0
          ? Math.round(
              cpuRows.reduce((sum, r) => sum + parseInt(r.value, 10), 0) /
                cpuRows.length
            )
          : undefined;

      // Build index → descr map, then apply optional interface filter
      const indexToDescr = new Map<string, string>();
      for (const row of ifDescrRows ?? none) {
        const idx = row.oid.split(".").at(-1) ?? "";
        indexToDescr.set(idx, row.value);
      }

      const activeIndexes = new Set<string>();
      if (this.interfaceFilter.length === 0) {
        for (const idx of indexToDescr.keys()) activeIndexes.add(idx);
      } else {
        for (const [idx, name] of indexToDescr) {
          if (this.interfaceFilter.includes(name)) activeIndexes.add(idx);
        }
      }

      const sumOctets = (
        rows: ReadonlyArray<{ oid: string; value: string }>
      ): number => {
        let total = 0;
        for (const row of rows) {
          const idx = row.oid.split(".").at(-1) ?? "";
          const n = Number(row.value);
          if (activeIndexes.has(idx) && Number.isFinite(n)) total += n;
        }
        return total;
      };

      type Rows = ReadonlyArray<{ oid: string; value: string }> | null;
      const covers = (rows: Rows): rows is ReadonlyArray<{
        oid: string;
        value: string;
      }> =>
        rows !== null &&
        rows.some((r) => activeIndexes.has(r.oid.split(".").at(-1) ?? ""));

      // Prefer 64-bit HC counters (no 4 GiB wrap); fall back to 32-bit only
      // when the agent has no HC rows. A walk that failed this cycle gives no
      // sample at all: summing what's left as 0 (or switching counter kind)
      // would turn the next poll's delta into a huge fake rate.
      let octets: { kind: "hc" | "32"; in: number; out: number } | null =
        null;
      if (ifDescrRows !== null && activeIndexes.size > 0) {
        if (covers(hcInRows) && covers(hcOutRows)) {
          octets = {
            kind: "hc",
            in: sumOctets(hcInRows),
            out: sumOctets(hcOutRows),
          };
        } else if (
          hcInRows !== null &&
          hcOutRows !== null &&
          covers(ifInRows) &&
          covers(ifOutRows)
        ) {
          octets = {
            kind: "32",
            in: sumOctets(ifInRows),
            out: sumOctets(ifOutRows),
          };
        }
      }

      // Byte rates between polls; a negative delta (counter wrap or device
      // reboot) skips the rate for this cycle instead of reporting garbage.
      // A missing sample keeps the previous baseline.
      const at = this.now();
      let ifInBps: number | undefined;
      let ifOutBps: number | undefined;
      if (octets) {
        const last = this.lastOctets;
        if (last && last.kind === octets.kind && at > last.at) {
          const dtSec = (at - last.at) / 1000;
          const dIn = octets.in - last.in;
          const dOut = octets.out - last.out;
          if (dIn >= 0 && dOut >= 0) {
            ifInBps = Math.round(dIn / dtSec);
            ifOutBps = Math.round(dOut / dtSec);
          }
        }
        this.lastOctets = { at, ...octets };
      }

      return {
        ...(sysUptime !== undefined ? { sysUptime } : {}),
        ...(connectedClients !== undefined ? { connectedClients } : {}),
        ...(cpuLoad !== undefined ? { cpuLoad } : {}),
        ...(octets ? { ifInOctets: octets.in, ifOutOctets: octets.out } : {}),
        ...(ifInBps !== undefined ? { ifInBps } : {}),
        ...(ifOutBps !== undefined ? { ifOutBps } : {}),
      };
    } catch {
      return {};
    }
  }
}
