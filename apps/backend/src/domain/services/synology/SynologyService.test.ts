import { describe, it, expect } from "vitest";
import { SynologyService } from "./SynologyService.js";
import { UnauthorizedError, UnavailableError } from "../../../core/errors.js";
import type {
  SnmpGetter,
  SnmpGetRequest,
  SnmpGetResult,
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

function fakeSnmp(
  fn: (req: SnmpGetRequest) => SnmpGetResult | Promise<SnmpGetResult>,
  calls: SnmpGetRequest[] = []
): SnmpGetter {
  return {
    get: async (req) => {
      calls.push(req);
      return fn(req);
    },
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
      "500000", // uptime ticks -> 5000 seconds
      '"DS920+"', // systemModel
      '"DSM 7.2"', // systemVersion
      "1", // systemStatus Normal
      "37", // cpuUsage
      "42", // cpuTemp
      "8192", // memoryTotal MB
      "2048", // memoryAvailable MB
      "75", // memoryUsagePercent
      "10000000", // diskTotal KB
      "4000000", // diskUsed KB
      "40", // diskUsagePercent
      "123456789", // networkRx (32-bit fallback)
      "987654321", // networkTx (32-bit fallback)
    ];
    // 64-bit HC counters are fetched separately (2 OIDs) and take precedence
    const hcValues = ["5123456789", "5987654321"];
    const svc = new SynologyService({
      snmp: fakeSnmp(
        (req) => (req.oids.length === 2 ? { values: hcValues } : { values }),
        calls
      ),
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
        diskTotal: 10_000_000 * 1024,
        diskUsed: 4_000_000 * 1024,
        diskFree: 6_000_000 * 1024,
        diskUsagePercent: 40,
        networkRx: 5123456789,
        networkTx: 5987654321,
      });
    }
    expect(calls[0]?.credentials.user).toBe("u");
    expect(calls[0]?.credentials.authProtocol).toBe("SHA");
    expect(calls[0]?.oids.length).toBe(15);
  });

  it("getStats falls back to 32-bit counters when HC OIDs fail", async () => {
    const values = Array.from({ length: 15 }, (_, i) =>
      i === 13 ? "111" : i === 14 ? "222" : "0"
    );
    const svc = new SynologyService({
      snmp: fakeSnmp((req) => {
        if (req.oids.length === 2) throw new Error("noSuchObject");
        return { values };
      }),
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

  it("getStats reports Warning when systemStatus != 1", async () => {
    const values = Array.from({ length: 15 }, (_, i) => (i === 4 ? "2" : "0"));
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
      "37",
      "42",
      "8192",
      "2048",
      "75",
      "10000000",
      "4000000",
      "40",
      "123456789",
      "987654321",
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
        "SYNO.DSM.Info/get": {
          model: "DS920+",
          version: "DSM 7.2-64570",
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
      "37",
      "0",
      "0",
      "0",
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
      "20",
      "0",
      "0",
      "0",
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
        "SYNO.DSM.Info/get": { model: "DS920+", version: "DSM 7.2" },
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

  it("DSM volume sizes override the single-volume SNMP disk scalars", async () => {
    const snmpValues = [
      '"DS920"',
      "500000",
      '"DS920+"',
      '"DSM 7.2"',
      "1",
      "37",
      "42",
      "8192",
      "2048",
      "75",
      "10000000",
      "4000000",
      "40",
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
        "SYNO.DSM.Info/get": {},
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
});
