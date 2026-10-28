import { describe, it, expect } from "vitest";
import { SynologyService } from "./SynologyService.js";
import { UnauthorizedError, UnavailableError } from "../../../core/errors.js";
import { selectExternalInterfaces } from "./SynologyService.js";
import type {
  SnmpGetter,
  SnmpGetRequest,
  SnmpGetResult,
  SnmpWalkRequest,
  SnmpWalkResult,
} from "../../../infra/snmp/snmpGetter.js";
import type { SynologyInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type { DsmClient } from "../../../infra/synology/dsmClient.js";

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

function makeConfig(
  overrides: Partial<SynologyInstance> = {}
): SynologyInstance {
  return {
    kind: "synology",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: "192.168.1.10",
    snmpUser: "u",
    snmpAuthKey: "a".repeat(8),
    snmpPrivKey: "p".repeat(8),
    snmpAuthProtocol: "SHA",
    snmpPrivProtocol: "AES",
    dsmUrl: "",
    dsmAccount: "",
    dsmPassword: "",
    dsmCertSha256: "",
    ...overrides,
  };
}

function fakeDsm(responses: Record<string, unknown>): DsmClient {
  return {
    call: async (api, _version, method) => {
      const key = `${api}/${method}`;
      if (key in responses) return responses[key] as never;
      throw new Error(`unexpected dsm call: ${key}`);
    },
  };
}

// ifTable as a DSM box with Open vSwitch exposes it: ifIndex 1 is loopback
const IF_WALK: Record<string, Array<[string, string]>> = {
  "1.3.6.1.2.1.2.2.1.2": [
    ["1", "lo"],
    ["2", "eth0"],
    ["3", "ovs_eth0"],
    ["4", "docker0"],
  ],
  "1.3.6.1.2.1.31.1.1.1.6": [
    ["1", "999999999999"],
    ["2", "5000000000"],
    ["3", "5123456789"],
    ["4", "777"],
  ],
  "1.3.6.1.2.1.31.1.1.1.10": [
    ["1", "999999999999"],
    ["2", "5000000000"],
    ["3", "5987654321"],
    ["4", "777"],
  ],
  "1.3.6.1.2.1.2.2.1.10": [
    ["1", "1"],
    ["2", "2"],
    ["3", "111"],
    ["4", "4"],
  ],
  "1.3.6.1.2.1.2.2.1.16": [
    ["1", "1"],
    ["2", "2"],
    ["3", "222"],
    ["4", "4"],
  ],
};

function walkFrom(
  table: Record<string, Array<[string, string]>>
): (req: SnmpWalkRequest) => SnmpWalkResult {
  return (req) => ({
    rows: (table[req.subtree] ?? []).map(([idx, value]) => ({
      oid: `${req.subtree}.${idx}`,
      value,
    })),
  });
}

function fakeSnmp(
  fn: (req: SnmpGetRequest) => SnmpGetResult | Promise<SnmpGetResult>,
  calls: SnmpGetRequest[] = [],
  walk: (req: SnmpWalkRequest) => SnmpWalkResult = walkFrom(IF_WALK)
): SnmpGetter {
  return {
    get: async (req) => {
      calls.push(req);
      return fn(req);
    },
    walk: async (req) => walk(req),
  };
}

describe("SynologyService", () => {
  it("id is synology:main", () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig(),
      ping: fakePing(),
      now: () => 0,
    });
    expect(svc.id).toBe("synology:main");
  });

  it("checkHealth reachable when snmp succeeds", async () => {
    let n = 0;
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({
        values: ['"DS920"', "123456", '"DS920+"', '"DSM 7.2"', "1"],
      })),
      config: makeConfig(),
      ping: fakePing(),
      now: () => (n += 5),
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.systemName).toBe("DS920");
      expect(res.value.details?.systemModel).toBe("DS920+");
      expect(typeof res.value.latencyMs).toBe("number");
    }
  });

  it("checkHealth unreachable when creds missing", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig({ snmpUser: "", snmpAuthKey: "", snmpPrivKey: "" }),
      ping: fakePing(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(false);
      expect(res.value.details?.credentialsConfigured).toBe(false);
    }
  });

  it("checkHealth unreachable when snmp throws", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => {
        throw new Error("timeout");
      }),
      config: makeConfig(),
      ping: fakePing(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(false);
      expect(res.value.message).toBe("timeout");
    }
  });

  it("getStats returns UnauthorizedError when creds missing", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig({ snmpUser: "" }),
      ping: fakePing(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnauthorizedError);
  });

  it("getStats parses all metrics", async () => {
    const calls: SnmpGetRequest[] = [];
    const values = [
      '"DS920"', // systemName
      "500000", // hrSystemUptime ticks -> 5000 seconds
      '"DS920+"', // systemModel
      '"DSM 7.2"', // systemVersion
      "1", // systemStatus Normal
      "63", // ssCpuIdle -> 37% busy
      "42", // cpuTemp
      "8388608", // memTotalReal kB (8 GiB)
      "1048576", // memAvailReal kB (1 GiB)
      "524288", // memBuffer kB (0.5 GiB)
      "524288", // memCached kB (0.5 GiB)
      "999999", // sysUpTime (agent) — ignored when hrSystemUptime is set
    ];
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values }), calls),
      config: makeConfig(),
      ping: fakePing(),
      now: () => 42,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.at).toBe(42);
      expect(res.value.metrics).toMatchObject({
        host: "192.168.1.10",
        systemName: "DS920",
        systemModel: "DS920+",
        systemVersion: "DSM 7.2",
        systemStatus: "Normal",
        uptime: 5000,
        cpuUsage: 37,
        cpuTemp: 42,
        memoryTotal: 8192 * 1024 * 1024,
        memoryAvailable: 2048 * 1024 * 1024,
        memoryUsed: (8192 - 2048) * 1024 * 1024,
        memoryUsagePercent: 75,
        // no SNMP source for volume sizes; only DSM provides them, so
        // without DSM they are "no data", not an empty 0-byte disk
        diskTotal: null,
        diskUsed: null,
        diskFree: null,
        diskUsagePercent: null,
        // regression: ovs_eth0 HC counters only — not loopback (ifIndex 1),
        // not eth0 (wrapped by ovs_eth0), not docker0
        networkRx: 5123456789,
        networkTx: 5987654321,
      });
    }
    expect(calls[0]?.credentials.user).toBe("u");
    expect(calls[0]?.credentials.authProtocol).toBe("SHA");
    expect(calls[0]?.oids.length).toBe(12);
    // regression: these OIDs are serialNumber / upgradeAvailable / disk-table
    // columns, not CPU, memory or volume size
    for (const wrong of [
      "1.3.6.1.4.1.6574.1.5.2.0",
      "1.3.6.1.4.1.6574.1.5.4.0",
      "1.3.6.1.4.1.6574.1.5.5.0",
      "1.3.6.1.4.1.6574.1.5.6.0",
      "1.3.6.1.4.1.6574.2.1.1.4.0",
      "1.3.6.1.4.1.6574.2.1.1.5.0",
      "1.3.6.1.4.1.6574.2.1.1.6.0",
    ]) {
      expect(calls[0]?.oids).not.toContain(wrong);
    }
    expect(calls[0]?.oids).toContain("1.3.6.1.4.1.2021.11.11.0");
    expect(calls[0]?.oids).toContain("1.3.6.1.4.1.2021.4.5.0");
  });

  it("getStats falls back to 32-bit counters when HC OIDs fail", async () => {
    const values = Array.from({ length: 12 }, () => "0");
    const noHc = { ...IF_WALK };
    delete noHc["1.3.6.1.2.1.31.1.1.1.6"];
    delete noHc["1.3.6.1.2.1.31.1.1.1.10"];
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values }), [], walkFrom(noHc)),
      config: makeConfig(),
      ping: fakePing(),
      now: () => 42,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        networkRx: 111,
        networkTx: 222,
      });
    }
  });

  it("selectExternalInterfaces prefers bond, then ovs_, then eth; never lo", () => {
    const pick = (names: string[]) =>
      [
        ...selectExternalInterfaces(
          new Map(names.map((n, i) => [String(i + 1), n]))
        ),
      ]
        .map((idx) => names[Number(idx) - 1])
        .sort();
    expect(pick(["lo", "eth0", "eth1", "bond0"])).toEqual(["bond0"]);
    expect(pick(["lo", "eth0", "ovs_eth0", "docker0"])).toEqual(["ovs_eth0"]);
    expect(pick(["lo", "eth0", "eth1", "veth12ab"])).toEqual(["eth0", "eth1"]);
    expect(pick(["lo", "enp3s0"])).toEqual(["enp3s0"]);
    expect(pick(["lo"])).toEqual([]);
  });

  it("getStats reports Warning when systemStatus != 1", async () => {
    const values = Array.from({ length: 12 }, (_, i) => (i === 4 ? "2" : "0"));
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values })),
      config: makeConfig(),
      ping: fakePing(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.systemStatus).toBe("Warning");
  });

  it("getStats maps snmp failure to UnavailableError", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => {
        throw new Error("snmpget exit 1");
      }),
      config: makeConfig(),
      ping: fakePing(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });

  // SY2: DSM extended stats

  it("getStats merges DSM metrics when dsm dep provided", async () => {
    const snmpValues = [
      '"DS920"',
      "500000",
      '"DS920+"',
      '"DSM 7.2"',
      "1",
      "63",
      "42",
      "8388608",
      "2097152",
      "0",
      "0",
      "0",
    ];
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: snmpValues })),
      config: makeConfig({
        dsmUrl: "http://nas:5000",
        dsmAccount: "admin",
        dsmPassword: "pass",
      }),
      ping: fakePing(),
      dsm: fakeDsm({
        "SYNO.DSM.Info/getinfo": {
          model: "DS920+",
          version: "64570",
          version_string: "DSM 7.2-64570",
          temperature: 38,
        },
        "SYNO.Core.System.Status/get": {
          cpu_fan_status: "normal",
          sys_fan_status: "normal",
          power_status: "normal",
        },
        "SYNO.Storage.CGI.Storage/load_info": {
          volumes: [{ status: "normal" }, { status: "normal" }],
          disks: [
            { status: "normal", temp: 35 },
            { status: "crashed", temp: 37 },
          ],
        },
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const m = res.value.metrics;
      expect(m.dsmTemperature).toBe(38);
      expect(m.dsmVersion).toBe("DSM 7.2-64570");
      expect(m.cpuFanStatus).toBe("normal");
      expect(m.sysFanStatus).toBe("normal");
      expect(m.powerStatus).toBe("normal");
      expect(m.volumeCount).toBe(2);
      expect(m.volumeDegradedCount).toBe(0);
      expect(m.diskCount).toBe(2);
      expect(m.diskDegradedCount).toBe(1);
    }
  });

  it("getStats omits DSM metrics when DSM calls throw", async () => {
    const snmpValues = [
      "0",
      "0",
      "0",
      "0",
      "1",
      "63",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
    ];
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: snmpValues })),
      config: makeConfig({
        dsmUrl: "http://nas:5000",
        dsmAccount: "admin",
        dsmPassword: "pass",
      }),
      ping: fakePing(),
      dsm: {
        call: async () => {
          throw new Error("DSM unreachable");
        },
      },
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.cpuUsage).toBe(37);
      expect(res.value.metrics.dsmTemperature).toBeUndefined();
      expect(res.value.metrics.volumeCount).toBeUndefined();
    }
  });

  it("getStats omits DSM metrics when dsm dep absent", async () => {
    const snmpValues = [
      "0",
      "0",
      "0",
      "0",
      "1",
      "80",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
    ];
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: snmpValues })),
      config: makeConfig(),
      ping: fakePing(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.cpuUsage).toBe(20);
      expect(res.value.metrics.dsmTemperature).toBeUndefined();
      expect(res.value.metrics.diskCount).toBeUndefined();
    }
  });

  it("getStats serves DSM-only stats when SNMP creds are missing", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => {
        throw new Error("snmp must not be called in DSM-only mode");
      }),
      config: makeConfig({
        snmpUser: "",
        snmpAuthKey: "",
        snmpPrivKey: "",
        dsmUrl: "http://nas:5000",
        dsmAccount: "admin",
        dsmPassword: "pass",
      }),
      ping: fakePing(),
      dsm: fakeDsm({
        "SYNO.Core.System.Utilization/get": {
          cpu: { user_load: 10, system_load: 5, other_load: 2 },
          memory: { real_usage: 60 },
          network: [{ device: "total", rx: 111, tx: 222 }],
        },
        "SYNO.DSM.Info/getinfo": { model: "DS920+", version: "DSM 7.2" },
        "SYNO.Core.System.Status/get": { power_status: "normal" },
        "SYNO.Storage.CGI.Storage/load_info": {
          volumes: [
            {
              status: "normal",
              size: { total: "2000000000", used: "1000000000" },
            },
          ],
          disks: [{ status: "normal" }],
        },
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const m = res.value.metrics;
      expect(m.cpuUsage).toBe(17);
      expect(m.memoryUsagePercent).toBe(60);
      expect(m.systemStatus).toBe("Unknown");
      expect(m.diskTotal).toBe(2_000_000_000);
      expect(m.diskUsed).toBe(1_000_000_000);
      expect(m.diskUsagePercent).toBe(50);
      expect(m.dsmCpuLoad).toBe(17);
      expect(m.dsmMemUsagePercent).toBe(60);
      expect(m.dsmNetRx).toBe(111);
      expect(m.dsmNetTx).toBe(222);
    }
  });

  it("getStats returns UnauthorizedError when neither SNMP nor DSM configured", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig({ snmpUser: "", snmpAuthKey: "", snmpPrivKey: "" }),
      ping: fakePing(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
  });

  it("disk totals sum every DSM volume", async () => {
    const snmpValues = [
      '"DS920"',
      "500000",
      '"DS920+"',
      '"DSM 7.2"',
      "1",
      "63",
      "42",
      "8388608",
      "2097152",
      "0",
      "0",
      "0",
    ];
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: snmpValues })),
      config: makeConfig({
        dsmUrl: "http://nas:5000",
        dsmAccount: "admin",
        dsmPassword: "pass",
      }),
      ping: fakePing(),
      dsm: fakeDsm({
        "SYNO.Core.System.Utilization/get": {},
        "SYNO.DSM.Info/getinfo": {},
        "SYNO.Core.System.Status/get": {},
        "SYNO.Storage.CGI.Storage/load_info": {
          volumes: [
            {
              status: "normal",
              size: { total: 2_000_000_000, used: 1_000_000_000 },
            },
            {
              status: "normal",
              size: { total: 3_000_000_000, used: 500_000_000 },
            },
          ],
          disks: [],
        },
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.diskTotal).toBe(5_000_000_000);
      expect(res.value.metrics.diskUsed).toBe(1_500_000_000);
      expect(res.value.metrics.diskUsagePercent).toBe(30);
      expect(res.value.metrics.diskFree).toBe(3_500_000_000);
    }
  });

  it("falls back to agent sysUpTime when hrSystemUptime is missing", async () => {
    const values = Array.from({ length: 12 }, (_, i) =>
      i === 1 ? "" : i === 11 ? "300000" : "0"
    );
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values })),
      config: makeConfig(),
      ping: fakePing(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.uptime).toBe(3000);
  });

  it("uses DSM utilization CPU when ssCpuIdle is missing", async () => {
    const values = Array.from({ length: 12 }, (_, i) => (i === 5 ? "" : "0"));
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values })),
      config: makeConfig({
        dsmUrl: "http://nas:5000",
        dsmAccount: "admin",
        dsmPassword: "pass",
      }),
      ping: fakePing(),
      dsm: fakeDsm({
        "SYNO.Core.System.Utilization/get": {
          cpu: { user_load: 10, system_load: 5, other_load: 0 },
        },
        "SYNO.DSM.Info/getinfo": {},
        "SYNO.Core.System.Status/get": {},
        "SYNO.Storage.CGI.Storage/load_info": {},
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.cpuUsage).toBe(15);
  });

  const DSM_ONLY = {
    snmpUser: "",
    snmpAuthKey: "",
    snmpPrivKey: "",
    dsmUrl: "http://nas:5000",
    dsmAccount: "admin",
    dsmPassword: "pass",
  };

  it("checkHealth in DSM-only mode is reachable when DSM answers", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => {
        throw new Error("snmp must not be called in DSM-only mode");
      }),
      config: makeConfig(DSM_ONLY),
      ping: fakePing(),
      dsm: fakeDsm({
        "SYNO.DSM.Info/getinfo": { model: "DS920+", version: "DSM 7.2" },
      }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.source).toBe("dsm");
      expect(res.value.details?.systemModel).toBe("DS920+");
    }
  });

  it("checkHealth in DSM-only mode is unreachable when DSM fails", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig(DSM_ONLY),
      ping: fakePing(),
      dsm: {
        call: async () => {
          throw new UnauthorizedError("synology dsm login failed: code 400");
        },
      },
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok && res.value.reachable).toBe(false);
    if (res.ok) expect(res.value.message).toContain("login failed");
  });

  it("getStats in DSM-only mode returns the error when every DSM call fails", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values: [] })),
      config: makeConfig(DSM_ONLY),
      ping: fakePing(),
      dsm: {
        call: async () => {
          throw new UnauthorizedError("synology dsm login failed: code 400");
        },
      },
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    // previously ok() with cpuUsage 0, memoryUsagePercent 0, diskTotal 0
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNAUTHORIZED");
  });

  it("getStats in DSM-only mode reports null, not 0, for SNMP-only metrics and uses DSM info", async () => {
    const svc = new SynologyService({
      snmp: fakeSnmp(() => {
        throw new Error("snmp must not be called in DSM-only mode");
      }),
      config: makeConfig(DSM_ONLY),
      ping: fakePing(),
      dsm: fakeDsm({
        "SYNO.Core.System.Utilization/get": {},
        "SYNO.DSM.Info/getinfo": {
          model: "DS920+",
          version: "64570",
          version_string: "DSM 7.2-64570",
          temperature: 38,
        },
        "SYNO.Core.System.Status/get": {},
        "SYNO.Storage.CGI.Storage/load_info": {},
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const m = res.value.metrics;
      // previously cpuTemp 0, uptime 0, memoryTotal 0, systemModel ""
      expect(m.cpuTemp).toBe(38);
      expect(m.systemModel).toBe("DS920+");
      expect(m.systemVersion).toBe("DSM 7.2-64570");
      expect(m.systemName).toBeNull();
      expect(m.uptime).toBeNull();
      expect(m.cpuUsage).toBeNull();
      expect(m.memoryTotal).toBeNull();
      expect(m.memoryAvailable).toBeNull();
      expect(m.memoryUsed).toBeNull();
      expect(m.memoryUsagePercent).toBeNull();
      expect(m.diskTotal).toBeNull();
      expect(m.diskUsagePercent).toBeNull();
      expect(m.systemStatus).toBe("Unknown");
      expect(m.dsmError).toBeUndefined();
    }
  });

  it("getStats reports null for SNMP varbind errors and falls back to DSM", async () => {
    // snmpGetterImpl maps a varbind error (noSuchObject etc.) to ""
    const values = Array.from({ length: 12 }, (_, i) => (i === 5 ? "63" : ""));
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values })),
      config: makeConfig({
        dsmUrl: "http://nas:5000",
        dsmAccount: "admin",
        dsmPassword: "pass",
      }),
      ping: fakePing(),
      dsm: fakeDsm({
        "SYNO.Core.System.Utilization/get": {},
        "SYNO.DSM.Info/getinfo": {
          model: "DS920+",
          version: "DSM 7.2",
          temperature: 41,
        },
        "SYNO.Core.System.Status/get": {},
        "SYNO.Storage.CGI.Storage/load_info": {},
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const m = res.value.metrics;
      expect(m.cpuUsage).toBe(37);
      expect(m.cpuTemp).toBe(41);
      expect(m.systemModel).toBe("DS920+");
      expect(m.systemVersion).toBe("DSM 7.2");
      expect(m.uptime).toBeNull();
      expect(m.memoryTotal).toBeNull();
      expect(m.memoryUsagePercent).toBeNull();
      // an unreadable systemStatus is not a "Warning" (critical tile)
      expect(m.systemStatus).toBe("Unknown");
    }
  });

  it("getStats in SNMP+DSM mode surfaces a DSM login failure as dsmError", async () => {
    const values = Array.from({ length: 12 }, () => "1");
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values })),
      config: makeConfig({
        dsmUrl: "http://nas:5000",
        dsmAccount: "admin",
        dsmPassword: "wrong",
      }),
      ping: fakePing(),
      dsm: {
        call: async () => {
          throw new UnauthorizedError("synology dsm login failed: code 400");
        },
      },
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    // SNMP still answers, so stats stay ok; the DSM failure is not silent
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.dsmError).toBe(
        "synology dsm login failed: code 400"
      );
      expect(res.value.metrics.systemStatus).toBe("Normal");
    }
  });

  it("getStats omits dsmError when every DSM call succeeds", async () => {
    const values = Array.from({ length: 12 }, () => "1");
    const svc = new SynologyService({
      snmp: fakeSnmp(() => ({ values })),
      config: makeConfig({
        dsmUrl: "http://nas:5000",
        dsmAccount: "admin",
        dsmPassword: "pass",
      }),
      ping: fakePing(),
      dsm: fakeDsm({
        "SYNO.Core.System.Utilization/get": {},
        "SYNO.DSM.Info/getinfo": {},
        "SYNO.Core.System.Status/get": {},
        "SYNO.Storage.CGI.Storage/load_info": {},
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.dsmError).toBeUndefined();
  });

  describe("network rates", () => {
    const values = Array.from({ length: 12 }, () => "0");
    // mutable copy of IF_WALK; ovs_eth0 (ifIndex 3) is the selected interface
    function table(rx: string, tx: string) {
      return {
        ...IF_WALK,
        "1.3.6.1.2.1.31.1.1.1.6": [["3", rx]] as Array<[string, string]>,
        "1.3.6.1.2.1.31.1.1.1.10": [["3", tx]] as Array<[string, string]>,
      };
    }

    it("a failed ifDescr walk reports no traffic and keeps the rate baseline", async () => {
      let t = 0;
      let current = table("1000000000000", "2000000000000");
      let failDescr = false;
      const svc = new SynologyService({
        snmp: fakeSnmp(
          () => ({ values }),
          [],
          (req) => {
            if (failDescr && req.subtree === "1.3.6.1.2.1.2.2.1.2") {
              throw new Error("walk timed out");
            }
            return walkFrom(current)(req);
          }
        ),
        config: makeConfig(),
        ping: fakePing(),
        now: () => t,
      });
      await svc.getStats(new AbortController().signal);

      t = 30_000;
      failDescr = true;
      const partial = await svc.getStats(new AbortController().signal);
      expect(partial.ok).toBe(true);
      if (partial.ok) {
        expect(partial.value.metrics.networkRx).toBeUndefined();
        expect(partial.value.metrics.networkRxBps).toBeUndefined();
      }

      t = 60_000;
      failDescr = false;
      current = table("1000003000000", "2000006000000");
      const next = await svc.getStats(new AbortController().signal);
      expect(next.ok).toBe(true);
      if (next.ok) {
        // 3e6 bytes over 60 s since the last good sample, not ~1e12 / 30 s
        expect(next.value.metrics.networkRxBps).toBe(50_000);
        expect(next.value.metrics.networkTxBps).toBe(100_000);
      }
    });

    it("a failed HC walk is not replaced by the 32-bit sum", async () => {
      let failHc = false;
      let t = 0;
      const svc = new SynologyService({
        snmp: fakeSnmp(
          () => ({ values }),
          [],
          (req) => {
            if (failHc && req.subtree === "1.3.6.1.2.1.31.1.1.1.6") {
              throw new Error("walk timed out");
            }
            return walkFrom(IF_WALK)(req);
          }
        ),
        config: makeConfig(),
        ping: fakePing(),
        now: () => t,
      });
      await svc.getStats(new AbortController().signal);
      t = 30_000;
      failHc = true;
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.metrics.networkRx).toBeUndefined();
        expect(res.value.metrics.networkRxBps).toBeUndefined();
      }
    });

    it("no rate across a switch between 32-bit and HC counters", async () => {
      let hc = false;
      let t = 0;
      const noHc: Record<string, Array<[string, string]>> = { ...IF_WALK };
      delete noHc["1.3.6.1.2.1.31.1.1.1.6"];
      delete noHc["1.3.6.1.2.1.31.1.1.1.10"];
      const svc = new SynologyService({
        snmp: fakeSnmp(
          () => ({ values }),
          [],
          (req) => walkFrom(hc ? IF_WALK : noHc)(req)
        ),
        config: makeConfig(),
        ping: fakePing(),
        now: () => t,
      });
      await svc.getStats(new AbortController().signal);
      t = 30_000;
      hc = true;
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.metrics.networkRx).toBe(5123456789);
        expect(res.value.metrics.networkRxBps).toBeUndefined();
      }
    });
  });
});

