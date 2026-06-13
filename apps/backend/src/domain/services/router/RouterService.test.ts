import { describe, it, expect } from "vitest";
import { RouterService } from "./RouterService.js";
import type {
  PingProber,
  PingRequest,
  PingResult,
} from "../../../infra/net/pingProbe.js";
import type {
  TcpProber,
  TcpProbeRequest,
} from "../../../infra/net/tcpProbe.js";
import type { RouterInstance } from "../../../config/services.js";
import type {
  SnmpGetter,
  SnmpWalkRequest,
  SnmpWalkResult,
} from "../../../infra/snmp/snmpGetter.js";

function makeConfig(overrides: Partial<RouterInstance> = {}): RouterInstance {
  return {
    kind: "router",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: "192.168.1.1",
    ports: [80, 443],
    pingCount: 1,
    interfaceFilter: [],
    ...overrides,
  };
}

/** Fake SnmpGetter: returns rows keyed by subtree OID prefix. */
function fakeSnmp(
  walkMap: Record<string, Array<{ oid: string; value: string }>>
): SnmpGetter {
  return {
    get: async () => ({ values: [] }),
    walk: async (req: SnmpWalkRequest): Promise<SnmpWalkResult> => {
      const rows = walkMap[req.subtree] ?? [];
      return { rows };
    },
  };
}

function failSnmp(): SnmpGetter {
  return {
    get: async () => {
      throw new Error("unreachable");
    },
    walk: async () => {
      throw new Error("snmp unreachable");
    },
  };
}

function fakePing(result: PingResult): PingProber {
  return { probe: async (_: PingRequest) => result };
}

function fakeTcp(map: Record<number, boolean>): TcpProber {
  return { probe: async (req: TcpProbeRequest) => Boolean(map[req.port]) };
}

describe("RouterService", () => {
  it("id is kind:instanceId", () => {
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe("router:main");
  });

  it("reachable when any port open", async () => {
    const svc = new RouterService({
      ping: fakePing({ success: false }),
      tcp: fakeTcp({ 80: true, 443: false }),
      config: makeConfig(),
      now: () => 5,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.anyPortOpen).toBe(true);
      expect(res.value.details?.icmpAlive).toBe(false);
    }
  });

  it("reachable when icmp alive and no ports open", async () => {
    const svc = new RouterService({
      ping: fakePing({ success: true, avgMs: 12 }),
      tcp: fakeTcp({ 80: false, 443: false }),
      config: makeConfig(),
      now: () => 5,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.latencyMs).toBe(12);
      expect(res.value.details?.icmpAlive).toBe(true);
    }
  });

  it("not reachable when everything fails", async () => {
    const svc = new RouterService({
      ping: fakePing({ success: false }),
      tcp: fakeTcp({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it("reports a single host tier (no service) when no ports configured", async () => {
    const svc = new RouterService({
      ping: fakePing({ success: true, avgMs: 8 }),
      tcp: fakeTcp({}),
      config: makeConfig({ ports: [] }),
      now: () => 5,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.host?.reachable).toBe(true);
      // no service tier emitted, so the UI shows one dot instead of a red square
      expect(res.value.service).toBeUndefined();
    }
  });

  it("getStats exposes host+portCount", async () => {
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      config: makeConfig({ ports: [22, 80, 443] }),
      now: () => 7,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.host).toBe("192.168.1.1");
      expect(res.value.metrics.portCount).toBe(3);
      expect(res.value.metrics.configured).toBe(true);
    }
  });
});

// ─── SNMP stats (R1) ──────────────────────────────────────────────────────────

const SNMP_OID = {
  sysUpTime: "1.3.6.1.2.1.1.3",
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",
  arpTable: "1.3.6.1.2.1.4.22.1.2",
  hrProcessorLoad: "1.3.6.1.2.1.25.3.3.1.2",
  hrStorageDescr: "1.3.6.1.2.1.25.2.3.1.3",
  hrStorageSize: "1.3.6.1.2.1.25.2.3.1.5",
  hrStorageUsed: "1.3.6.1.2.1.25.2.3.1.6",
} as const;

function snmpConfig(overrides: Partial<RouterInstance> = {}): RouterInstance {
  return makeConfig({ snmpCommunity: "public", ...overrides });
}

describe("RouterService SNMP stats (R1)", () => {
  it("getStats includes sysUptime when snmpCommunity set", async () => {
    const snmp = fakeSnmp({
      [SNMP_OID.sysUpTime]: [
        { oid: `${SNMP_OID.sysUpTime}.0`, value: "50000" },
      ],
    });
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      snmp,
      config: snmpConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.sysUptime).toBe(50000);
  });

  it("connectedClients = count of ARP table rows", async () => {
    const snmp = fakeSnmp({
      [SNMP_OID.arpTable]: [
        {
          oid: `${SNMP_OID.arpTable}.1.192.168.1.10`,
          value: "00:11:22:33:44:55",
        },
        {
          oid: `${SNMP_OID.arpTable}.1.192.168.1.20`,
          value: "aa:bb:cc:dd:ee:ff",
        },
        {
          oid: `${SNMP_OID.arpTable}.1.192.168.1.30`,
          value: "11:22:33:44:55:66",
        },
      ],
    });
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      snmp,
      config: snmpConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.connectedClients).toBe(3);
  });

  it("cpuLoad = average hrProcessorLoad entries", async () => {
    const snmp = fakeSnmp({
      [SNMP_OID.hrProcessorLoad]: [
        { oid: `${SNMP_OID.hrProcessorLoad}.1`, value: "40" },
        { oid: `${SNMP_OID.hrProcessorLoad}.2`, value: "60" },
      ],
    });
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      snmp,
      config: snmpConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.cpuLoad).toBe(50);
  });

  it("ifInOctets + ifOutOctets summed across interfaces", async () => {
    const snmp = fakeSnmp({
      [SNMP_OID.ifDescr]: [{ oid: `${SNMP_OID.ifDescr}.1`, value: "eth0" }],
      [SNMP_OID.ifInOctets]: [
        { oid: `${SNMP_OID.ifInOctets}.1`, value: "1000" },
      ],
      [SNMP_OID.ifOutOctets]: [
        { oid: `${SNMP_OID.ifOutOctets}.1`, value: "2000" },
      ],
    });
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      snmp,
      config: snmpConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.ifInOctets).toBe(1000);
      expect(res.value.metrics.ifOutOctets).toBe(2000);
    }
  });

  it("interfaceFilter restricts which interfaces count", async () => {
    const snmp = fakeSnmp({
      [SNMP_OID.ifDescr]: [
        { oid: `${SNMP_OID.ifDescr}.1`, value: "lo" },
        { oid: `${SNMP_OID.ifDescr}.2`, value: "eth0" },
      ],
      [SNMP_OID.ifInOctets]: [
        { oid: `${SNMP_OID.ifInOctets}.1`, value: "999" },
        { oid: `${SNMP_OID.ifInOctets}.2`, value: "500" },
      ],
      [SNMP_OID.ifOutOctets]: [
        { oid: `${SNMP_OID.ifOutOctets}.1`, value: "888" },
        { oid: `${SNMP_OID.ifOutOctets}.2`, value: "300" },
      ],
    });
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      snmp,
      config: snmpConfig({ interfaceFilter: ["eth0"] }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Only eth0 (index 2) should count
      expect(res.value.metrics.ifInOctets).toBe(500);
      expect(res.value.metrics.ifOutOctets).toBe(300);
    }
  });

  it("graceful when snmpCommunity not set — no SNMP fields", async () => {
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      config: makeConfig(), // no snmpCommunity
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.sysUptime).toBeUndefined();
      expect(res.value.metrics.connectedClients).toBeUndefined();
    }
  });

  it("graceful when SNMP walk fails — returns basic metrics", async () => {
    const svc = new RouterService({
      ping: fakePing({ success: true }),
      tcp: fakeTcp({}),
      snmp: failSnmp(),
      config: snmpConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.host).toBe("192.168.1.1");
      expect(res.value.metrics.sysUptime).toBeUndefined();
    }
  });
});
