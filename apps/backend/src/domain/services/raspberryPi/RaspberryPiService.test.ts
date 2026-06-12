import { describe, it, expect } from "vitest";
import { RaspberryPiService } from "./RaspberryPiService.js";
import { SSH_SEGMENT_DELIMITER } from "../../../infra/ssh/compound.js";
import { parseRpiInfo } from "./parseRpiInfo.js";
import { getPiModel } from "./piModel.js";
import { GpioController } from "./GpioController.js";
import type {
  PigpioClient,
  PigpioHandle,
} from "../../../infra/gpio/pigpioClient.js";
import type { PingProber, PingResult } from "../../../infra/net/pingProbe.js";
import type {
  SshExecutor,
  SshExecResult,
  SshExecRequest,
} from "../../../infra/ssh/sshExecutor.js";
import type { RaspberryPiInstance } from "../../../config/services.js";

function makeConfig(
  overrides: Partial<RaspberryPiInstance> = {}
): RaspberryPiInstance {
  return {
    kind: "raspberryPi",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: "192.168.1.40",
    port: 8888,
    macMiniHost: "192.168.1.50",
    macMiniSshPort: 22,
    macMiniSshUser: "me",
    macMiniSshKeyPath: "/tmp/id_rsa",
    macMiniSshPassphrase: "",
    nodePath: "/usr/local/bin/node",
    rpiCliPath: "/opt/rpi/cli.js",
    pingCount: 1,
    ...overrides,
  };
}

interface FakeHandleOpts {
  hwRevision?: number | Error;
  pigpioVersion?: number | Error;
  currentTick?: number | Error;
  readValue?: 0 | 1;
  onEnd?: () => void;
  onWrite?: (gpio: number, level: 0 | 1) => void;
  onSetMode?: (gpio: number, mode: number) => void;
}

function fakeHandle(opts: FakeHandleOpts = {}): PigpioHandle {
  const maybe = <T>(v: T | Error | undefined, fallback: T): Promise<T> =>
    v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? fallback);
  return {
    read: async () => opts.readValue ?? 0,
    write: async (g, l) => opts.onWrite?.(g, l),
    setMode: async (g, m) => opts.onSetMode?.(g, m),
    getHardwareRevision: () => maybe(opts.hwRevision, 0xa22082),
    getPigpioVersion: () => maybe(opts.pigpioVersion, 79),
    getCurrentTick: () => maybe(opts.currentTick, 123_456_789),
    end: async () => opts.onEnd?.(),
  };
}

function fakePigpio(handle: PigpioHandle | Error): PigpioClient {
  return {
    connect: async () => {
      if (handle instanceof Error) throw handle;
      return handle;
    },
  };
}

function fakePing(result: PingResult): PingProber {
  return { probe: async () => result };
}

function fakeSsh(
  map: Record<string, SshExecResult>,
  calls: SshExecRequest[] = []
): SshExecutor {
  const lookup = (command: string): SshExecResult | null => {
    for (const [pattern, res] of Object.entries(map)) {
      if (command.includes(pattern)) return res;
    }
    return null;
  };
  return {
    exec: async (req) => {
      calls.push(req);
      // direct stats arrive as one compound command — synthesize the
      // delimiter-joined output from the per-command fixture map
      if (req.command.includes(SSH_SEGMENT_DELIMITER)) {
        const subCommands = req.command.split(
          `; echo "${SSH_SEGMENT_DELIMITER}"; `
        );
        const segments = subCommands.map((sub) => {
          const res = lookup(sub);
          return res && res.code === 0 ? res.stdout : "";
        });
        return {
          stdout: segments.join(`\n${SSH_SEGMENT_DELIMITER}\n`),
          stderr: "",
          code: 0,
        };
      }
      const res = lookup(req.command);
      if (res) return res;
      return { stdout: "", stderr: "no match", code: 127 };
    },
  };
}

describe("getPiModel", () => {
  it("resolves new-style Pi 4B", () => {
    expect(getPiModel(0xa22082)).toBe("Pi 3B");
  });
  it("resolves new-style Pi 5", () => {
    expect(getPiModel((0x17 << 4) | 0x800000)).toBe("Pi 5");
  });
  it("resolves old-style Pi B+", () => {
    expect(getPiModel(0x0010)).toBe("Pi B+");
  });
  it("returns Unknown on null", () => {
    expect(getPiModel(null)).toBe("Unknown");
  });
  it("returns Unknown (type N) for unmapped new-style", () => {
    expect(getPiModel((0xfe << 4) | 0x800000)).toMatch(/Unknown \(type/);
  });
});

describe("parseRpiInfo", () => {
  it("parses full payload", () => {
    const info = parseRpiInfo(
      {
        model: "Pi 4B",
        prettyName: "Raspberry Pi 4",
        processor: "BCM2711",
        memory: "4GB",
        isRpi: true,
        revision: "a03111",
        state: {
          temp: "48.3",
          freq: 1_500_000_000,
          volt: "0.87",
          load: "0.12",
          swap: "0",
          boot: "2020-01-01T00:00:00Z",
        },
      },
      () => new Date("2020-01-01T00:01:00Z").getTime()
    );
    expect(info.piModel).toBe("Pi 4B");
    expect(info.cpuTemp).toBe(48.3);
    expect(info.clockRate).toBe(1500);
    expect(info.voltage).toBe(0.87);
    expect(info.uptime).toBe(60);
    expect(info.hwRevision).toBe(0xa03111);
    expect(info.isRpi).toBe(true);
  });

  it("returns nulls on empty input", () => {
    const info = parseRpiInfo(null);
    expect(info.piModel).toBeNull();
    expect(info.cpuTemp).toBeNull();
    expect(info.isRpi).toBe(false);
  });

  it("ignores invalid values", () => {
    const info = parseRpiInfo({
      revision: "zzz",
      state: { temp: "nope", freq: "bad" },
    });
    expect(info.hwRevision).toBeNull();
    expect(info.cpuTemp).toBeNull();
    expect(info.clockRate).toBeNull();
  });
});

describe("RaspberryPiService.checkHealth", () => {
  it("online when pigpiod connects", async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: false }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 1000,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.pigpioOnline).toBe(true);
    }
  });

  it("warning when pigpiod fails but ping succeeds", async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(new Error("ECONNREFUSED")),
      ping: fakePing({ success: true, avgMs: 5 }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.pigpioOnline).toBe(false);
      expect(String(res.value.details?.["warning"])).toMatch(
        /pigpiod unavailable/
      );
    }
  });

  it("offline when both fail", async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(new Error("fail")),
      ping: fakePing({ success: false }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });
});

describe("RaspberryPiService.getStats", () => {
  it("composes pigpio + ssh rpi cli info", async () => {
    const rpiJson = JSON.stringify({
      model: "Pi 4B",
      state: { temp: "50.1", freq: 1_800_000_000, load: "0.2" },
    });
    const calls: SshExecRequest[] = [];
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(
        fakeHandle({
          hwRevision: 0xa22082,
          pigpioVersion: 79,
          currentTick: 60_000_000,
        })
      ),
      ping: fakePing({ success: true }),
      ssh: fakeSsh(
        { "cli.js": { stdout: rpiJson, stderr: "", code: 0 } },
        calls
      ),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics["piModel"]).toBe("Pi 3B");
      expect(res.value.metrics["pigpioVersion"]).toBe(79);
      expect(res.value.metrics["uptime"]).toBe(60);
      expect(res.value.metrics["cpuTemp"]).toBe(50.1);
      expect(res.value.metrics["clockRate"]).toBe(1800);
      expect(res.value.metrics["rpiCliAvailable"]).toBe(true);
    }
    expect(calls[0]?.command).toContain("/opt/rpi/cli.js");
    expect(calls[0]?.command).toContain("-H 192.168.1.40:8888");
  });

  it("skips ssh when not configured", async () => {
    const calls: SshExecRequest[] = [];
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh: fakeSsh({}, calls),
      config: makeConfig({ macMiniSshUser: "", macMiniSshKeyPath: "" }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics["rpiCliAvailable"]).toBe(false);
    expect(calls.length).toBe(0);
  });

  it("returns UnavailableError when pigpiod connect fails", async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(new Error("no route")),
      ping: fakePing({ success: false }),
      ssh: fakeSsh({}),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNAVAILABLE");
  });

  it("captures rpiCliError without failing stats", async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh: fakeSsh({ "cli.js": { stdout: "", stderr: "bad", code: 2 } }),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics["rpiCliAvailable"]).toBe(false);
      expect(String(res.value.metrics["rpiCliError"])).toMatch(
        /rpi cli exit 2/
      );
    }
  });
});

describe("RaspberryPiService.getStats — direct SSH path", () => {
  const DIRECT_SSH_MAP: Record<string, SshExecResult> = {
    measure_temp: { stdout: "temp=49.5'C", stderr: "", code: 0 },
    measure_clock: { stdout: "frequency(48)=1800000000", stderr: "", code: 0 },
    measure_volts: { stdout: "volt=0.8813V", stderr: "", code: 0 },
    get_throttled: { stdout: "throttled=0x0", stderr: "", code: 0 },
    loadavg: { stdout: "0.12 0.08 0.05 1/250 1234", stderr: "", code: 0 },
    meminfo: {
      stdout: "MemTotal:       3944936 kB\nMemFree:        123456 kB\n",
      stderr: "",
      code: 0,
    },
    uptime: { stdout: "12345.67 23456.78", stderr: "", code: 0 },
    cpuinfo: {
      stdout:
        "Hardware\t: BCM2711\nModel\t\t: Raspberry Pi 4 Model B Rev 1.1\n",
      stderr: "",
      code: 0,
    },
    "os-release": {
      stdout: 'PRETTY_NAME="Raspberry Pi OS Lite (64-bit)"\n',
      stderr: "",
      code: 0,
    },
  };

  function makeDirectConfig(
    overrides: Partial<RaspberryPiInstance> = {}
  ): RaspberryPiInstance {
    return makeConfig({
      sshUser: "pi",
      sshPort: 22,
      sshKeyPath: "/tmp/pi_id_rsa",
      sshPassphrase: "",
      // Omit macMini fields — direct SSH takes priority
      macMiniHost: "",
      macMiniSshUser: "",
      macMiniSshKeyPath: "",
      rpiCliPath: "",
      ...overrides,
    });
  }

  it("uses direct SSH when sshUser + sshKeyPath configured", async () => {
    const calls: SshExecRequest[] = [];
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(
        fakeHandle({ hwRevision: 0xa22082, pigpioVersion: 79, currentTick: 0 })
      ),
      ping: fakePing({ success: true }),
      ssh: fakeSsh(DIRECT_SSH_MAP, calls),
      config: makeDirectConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics["rpiCliAvailable"]).toBe(true);
      expect(res.value.metrics["cpuTemp"]).toBe(49.5);
      expect(res.value.metrics["clockRate"]).toBe(1800);
      expect(res.value.metrics["voltage"]).toBeCloseTo(0.8813);
      expect(res.value.metrics["throttled"]).toBe(0);
      expect(res.value.metrics["load"]).toBeCloseTo(0.12);
      expect(res.value.metrics["memory"]).toBe("3.8 GB");
      expect(res.value.metrics["uptime"]).toBe(12345);
      expect(res.value.metrics["prettyName"]).toBe(
        "Raspberry Pi OS Lite (64-bit)"
      );
      expect(res.value.metrics["processor"]).toBe("BCM2711");
      expect(res.value.metrics["isRpi"]).toBe(true);
    }
    // All direct SSH calls target the Pi host, not macMini
    for (const call of calls) {
      expect(call.host).toBe("192.168.1.40");
      expect(call.user).toBe("pi");
    }
  });

  it("reports non-zero throttled value when Pi is throttled", async () => {
    const throttledMap = {
      ...DIRECT_SSH_MAP,
      get_throttled: { stdout: "throttled=0x50005", stderr: "", code: 0 },
    };
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh: fakeSsh(throttledMap),
      config: makeDirectConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics["throttled"]).toBe(0x50005);
  });

  it("direct SSH takes priority over macMini relay when both configured", async () => {
    const calls: SshExecRequest[] = [];
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      // Map includes both direct and relay patterns; direct path never calls cli.js
      ssh: fakeSsh(
        { ...DIRECT_SSH_MAP, "cli.js": { stdout: "{}", stderr: "", code: 0 } },
        calls
      ),
      config: makeConfig({
        sshUser: "pi",
        sshKeyPath: "/tmp/pi_id_rsa",
        macMiniHost: "192.168.1.50",
        macMiniSshUser: "me",
        macMiniSshKeyPath: "/tmp/mini_key",
        rpiCliPath: "/opt/rpi/cli.js",
      }),
      now: () => 0,
    });
    await svc.getStats(new AbortController().signal);
    const hitCli = calls.some((c) => c.command.includes("cli.js"));
    expect(hitCli).toBe(false);
  });

  it("captures direct SSH error as rpiCliError without failing stats", async () => {
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh: {
        exec: async () => {
          throw new Error("ECONNREFUSED");
        },
      },
      config: makeDirectConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics["rpiCliAvailable"]).toBe(false);
      expect(String(res.value.metrics["rpiCliError"])).toMatch(/ECONNREFUSED/);
    }
  });

  it("falls back to macMini relay when direct SSH fails and relay is configured", async () => {
    const rpiJson = JSON.stringify({
      model: "Pi 4B",
      state: { temp: "50.1", freq: 1_800_000_000, load: "0.2" },
    });
    const calls: SshExecRequest[] = [];
    // Direct SSH commands fail (vcgencmd / cat → reject); only the relay's cli.js succeeds.
    const ssh: SshExecutor = {
      exec: async (req) => {
        calls.push(req);
        if (req.command.includes("cli.js")) {
          return { stdout: rpiJson, stderr: "", code: 0 };
        }
        throw new Error("ECONNREFUSED");
      },
    };
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh,
      config: makeConfig({
        sshUser: "pi",
        sshKeyPath: "/tmp/pi_id_rsa",
        macMiniHost: "192.168.1.50",
        macMiniSshUser: "me",
        macMiniSshKeyPath: "/tmp/mini_key",
        rpiCliPath: "/opt/rpi/cli.js",
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics["rpiCliAvailable"]).toBe(true);
      expect(res.value.metrics["cpuTemp"]).toBe(50.1);
      expect(res.value.metrics["rpiCliError"]).toBeUndefined();
    }
    // We attempted direct SSH first, then fell through to the relay.
    expect(calls.some((c) => c.command.includes("cli.js"))).toBe(true);
    expect(
      calls.some(
        (c) => c.command.includes("vcgencmd") || c.command.includes("/proc/")
      )
    ).toBe(true);
  });

  it("combines errors from both paths when direct fails and relay also fails", async () => {
    const ssh: SshExecutor = {
      exec: async (req) => {
        if (req.command.includes("cli.js")) throw new Error("relay-down");
        throw new Error("direct-down");
      },
    };
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh,
      config: makeConfig({
        sshUser: "pi",
        sshKeyPath: "/tmp/pi_id_rsa",
        macMiniHost: "192.168.1.50",
        macMiniSshUser: "me",
        macMiniSshKeyPath: "/tmp/mini_key",
        rpiCliPath: "/opt/rpi/cli.js",
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics["rpiCliAvailable"]).toBe(false);
      const err = String(res.value.metrics["rpiCliError"]);
      expect(err).toMatch(/direct-down/);
      expect(err).toMatch(/relay-down/);
    }
  });

  it("skips ssh entirely when neither direct nor macMini configured", async () => {
    const calls: SshExecRequest[] = [];
    const svc = new RaspberryPiService({
      pigpio: fakePigpio(fakeHandle()),
      ping: fakePing({ success: true }),
      ssh: fakeSsh({}, calls),
      config: makeConfig({
        sshUser: "",
        sshKeyPath: "",
        macMiniSshUser: "",
        macMiniSshKeyPath: "",
      }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics["rpiCliAvailable"]).toBe(false);
    expect(calls.length).toBe(0);
  });
});

describe("GpioController", () => {
  it("read returns 0 or 1", async () => {
    const ctrl = new GpioController({
      pigpio: fakePigpio(fakeHandle({ readValue: 1 })),
      config: makeConfig(),
    });
    expect(await ctrl.read(17)).toBe(1);
  });

  it("write invokes handle", async () => {
    let seen: [number, number] | null = null;
    const ctrl = new GpioController({
      pigpio: fakePigpio(
        fakeHandle({
          onWrite: (g, l) => {
            seen = [g, l];
          },
        })
      ),
      config: makeConfig(),
    });
    await ctrl.write(17, 1);
    expect(seen).toEqual([17, 1]);
  });

  it("setMode output maps to 1", async () => {
    let mode: number | null = null;
    const ctrl = new GpioController({
      pigpio: fakePigpio(
        fakeHandle({
          onSetMode: (_, m) => {
            mode = m;
          },
        })
      ),
      config: makeConfig(),
    });
    await ctrl.setMode(17, "output");
    expect(mode).toBe(1);
  });

  it("rejects invalid pins", async () => {
    const ctrl = new GpioController({
      pigpio: fakePigpio(fakeHandle()),
      config: makeConfig(),
    });
    await expect(ctrl.read(99)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("wraps connect failure in UnavailableError", async () => {
    const ctrl = new GpioController({
      pigpio: fakePigpio(new Error("refused")),
      config: makeConfig(),
    });
    await expect(ctrl.write(17, 0)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("ends handle after use", async () => {
    let ended = false;
    const ctrl = new GpioController({
      pigpio: fakePigpio(
        fakeHandle({
          onEnd: () => {
            ended = true;
          },
        })
      ),
      config: makeConfig(),
    });
    await ctrl.read(17);
    expect(ended).toBe(true);
  });
});
