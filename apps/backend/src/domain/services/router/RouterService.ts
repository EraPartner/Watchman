import { BaseService, type HealthResult, type HostHealth, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { ok } from '../../../core/result.js';
import type { RouterInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { TcpProber } from '../../../infra/net/tcpProbe.js';
import type { SnmpGetter } from '../../../infra/snmp/snmpGetter.js';

const OID = {
  sysUpTime:       '1.3.6.1.2.1.1.3',
  ifDescr:         '1.3.6.1.2.1.2.2.1.2',
  ifInOctets:      '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets:     '1.3.6.1.2.1.2.2.1.16',
  arpTable:        '1.3.6.1.2.1.4.22.1.2',
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',
} as const;

export interface RouterDeps {
  ping: PingProber;
  tcp: TcpProber;
  snmp?: SnmpGetter;
  config: RouterInstance;
  now: () => number;
}

export class RouterService extends BaseService {
  readonly kind = 'router';
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
      this.tcp.probe({ host: this.host, port, timeoutMs: this.timeoutMs, signal }),
    );
    const [pingRes, ...portResults] = await Promise.all([pingPromise, ...portPromises]);

    const ports: Record<string, boolean> = {};
    this.ports.forEach((port, i) => {
      ports[String(port)] = Boolean(portResults[i]);
    });

    const anyPortOpen = Object.values(ports).some((v) => v);
    const icmpAlive = pingRes.success;
    const host: HostHealth = { reachable: icmpAlive, ...(pingRes.avgMs !== undefined ? { pingMs: pingRes.avgMs } : {}) };
    const service = { reachable: anyPortOpen, details: { ports } };
    const reachable = host.reachable || service.reachable;
    const latencyMs = pingRes.avgMs ?? this.now() - started;

    return ok({
      reachable,
      latencyMs,
      at: this.now(),
      host,
      service,
      details: {
        icmpAlive,
        anyPortOpen,
        ports,
        host: this.host,
      },
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

  private async collectSnmpMetrics(signal: AbortSignal): Promise<Record<string, unknown>> {
    try {
      const community = this.snmpCommunity!;
      const v2c = { community };
      const host = this.host;
      const timeoutMs = this.timeoutMs;

      const [uptimeRows, ifDescrRows, ifInRows, ifOutRows, arpRows, cpuRows] = await Promise.all([
        this.snmp!.walk({ host, subtree: OID.sysUpTime, v2c, timeoutMs, signal }).then((r) => r.rows),
        this.snmp!.walk({ host, subtree: OID.ifDescr, v2c, timeoutMs, signal }).then((r) => r.rows),
        this.snmp!.walk({ host, subtree: OID.ifInOctets, v2c, timeoutMs, signal }).then((r) => r.rows),
        this.snmp!.walk({ host, subtree: OID.ifOutOctets, v2c, timeoutMs, signal }).then((r) => r.rows),
        this.snmp!.walk({ host, subtree: OID.arpTable, v2c, timeoutMs, signal }).then((r) => r.rows),
        this.snmp!.walk({ host, subtree: OID.hrProcessorLoad, v2c, timeoutMs, signal }).then((r) => r.rows),
      ]);

      const sysUptime = uptimeRows[0] ? parseInt(uptimeRows[0].value, 10) : undefined;

      const connectedClients = arpRows.length;

      const cpuLoad = cpuRows.length > 0
        ? Math.round(cpuRows.reduce((sum, r) => sum + parseInt(r.value, 10), 0) / cpuRows.length)
        : undefined;

      // Build index → descr map, then apply optional interface filter
      const indexToDescr = new Map<string, string>();
      for (const row of ifDescrRows) {
        const idx = row.oid.split('.').at(-1) ?? '';
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

      const sumOctets = (rows: ReadonlyArray<{ oid: string; value: string }>): number => {
        let total = 0;
        for (const row of rows) {
          const idx = row.oid.split('.').at(-1) ?? '';
          if (activeIndexes.has(idx)) total += parseInt(row.value, 10);
        }
        return total;
      };

      const ifInOctets = sumOctets(ifInRows);
      const ifOutOctets = sumOctets(ifOutRows);

      return {
        ...(sysUptime !== undefined ? { sysUptime } : {}),
        connectedClients,
        ...(cpuLoad !== undefined ? { cpuLoad } : {}),
        ifInOctets,
        ifOutOctets,
      };
    } catch {
      return {};
    }
  }
}
