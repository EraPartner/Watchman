import { describe, it, expect } from "vitest";
import { PiStatsCollector } from "./PiStatsCollector.js";
import { getPiModel } from "./piModel.js";
import type {
  PigpioClient,
  PigpioHandle,
} from "../../../infra/gpio/pigpioClient.js";
import type {
  SshExecutor,
  SshExecRequest,
  SshExecResult,
} from "../../../infra/ssh/sshExecutor.js";
import type { RaspberryPiInstance } from "../../../config/services.js";
import { SSH_SEGMENT_DELIMITER } from "../../../infra/ssh/compound.js";

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
    sshUser: "",
    sshPort: 22,
    sshKeyPath: "",
    sshPassphrase: "",
    sshHostKey: "",
    macMiniHost: "",
    macMiniSshPort: 22,
    macMiniSshUser: "",
    macMiniSshKeyPath: "",
    macMiniSshPassphrase: "",
    macMiniSshHostKey: "",
    nodePath: "/usr/local/bin/node",
    rpiCliPath: "",
    pingCount: 1,
    ...overrides,
  };
}

// only the read-only calls the collector makes
function fakePigpio(tick: number): PigpioClient {
  const handle = {
    getHardwareRevision: async () => 0xc03111,
    getPigpioVersion: async () => 79,
    getCurrentTick: async () => tick,
    end: async () => undefined,
  } as unknown as PigpioHandle;
  return { connect: async () => handle };
}

function fakeSsh(result: SshExecResult): SshExecutor {
  return { exec: async () => result };
}

describe("PiStatsCollector uptime", () => {
  it("does not report the wrapping pigpio tick as uptime", async () => {
    // regression: tick is a 32-bit microsecond counter (wraps ~71.6 min), so
    // a Pi up for days showed an uptime of at most 71 minutes
    const collector = new PiStatsCollector({
      pigpio: fakePigpio(4_000_000_000),
      ssh: fakeSsh({ stdout: "", stderr: "", code: 0 }),
      config: makeConfig(),
      now: () => 0,
    });
    const snap = await collector.collect(new AbortController().signal);
    expect(snap.uptime).toBeNull();
    expect(snap.piModel).toBe("Pi 4B");
  });

  it("takes uptime from the relay's boot time", async () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    const collector = new PiStatsCollector({
      pigpio: fakePigpio(1_000),
      ssh: fakeSsh({
        stdout: JSON.stringify({
          state: { boot: "2026-10-18T12:00:00Z", temp: "48.0" },
        }),
        stderr: "",
        code: 0,
      }),
      config: makeConfig({
        macMiniHost: "192.168.1.50",
        macMiniSshUser: "me",
        macMiniSshKeyPath: "/tmp/id_rsa",
        rpiCliPath: "/opt/rpi/cli.js",
      }),
      now: () => now,
    });
    const snap = await collector.collect(new AbortController().signal);
    expect(snap.rpiCliAvailable).toBe(true);
    expect(snap.uptime).toBe(3 * 86_400);
  });
});

describe("PiStatsCollector relay command", () => {
  it("quotes config values in the command it runs on the relay host", async () => {
    const commands: string[] = [];
    const collector = new PiStatsCollector({
      pigpio: fakePigpio(1_000),
      ssh: {
        exec: async (req) => {
          commands.push(req.command);
          return { stdout: "{}", stderr: "", code: 0 };
        },
      },
      config: makeConfig({
        host: "192.168.1.40",
        macMiniHost: "192.168.1.50",
        macMiniSshUser: "me",
        macMiniSshKeyPath: "/tmp/id_rsa",
        nodePath: "/opt/node 22/bin/node",
        rpiCliPath: "/opt/rpi/cli.js; touch /tmp/pwned",
      }),
      now: () => 0,
    });
    await collector.collect(new AbortController().signal);
    // Regression: the values were interpolated unquoted, so the `;` ran a
    // second command on the relay host.
    expect(commands).toContain(
      "'/opt/node 22/bin/node' '/opt/rpi/cli.js; touch /tmp/pwned' -H '192.168.1.40:8888' info"
    );
  });
});

describe("PiStatsCollector host key pinning", () => {
  const PI_KEY = "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU";
  const MAC_KEY = "SHA256:LXEWQrcmsEQBYnyp+6wy9chTD7GQPMTbAiWHF5IaSIE";

  function recordingSsh(requests: SshExecRequest[]): SshExecutor {
    return {
      exec: async (req) => {
        requests.push(req);
        return { stdout: "{}", stderr: "", code: 0 };
      },
    };
  }

  it("pins the Pi's key on direct SSH", async () => {
    const requests: SshExecRequest[] = [];
    await new PiStatsCollector({
      pigpio: fakePigpio(1_000),
      ssh: recordingSsh(requests),
      config: makeConfig({
        sshUser: "pi",
        sshKeyPath: "/tmp/pi_key",
        sshHostKey: PI_KEY,
      }),
      now: () => 0,
    }).collect(new AbortController().signal);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.hostKey === PI_KEY)).toBe(true);
  });

  it("pins the relay Mac's own key on the legacy relay", async () => {
    const requests: SshExecRequest[] = [];
    await new PiStatsCollector({
      pigpio: fakePigpio(1_000),
      ssh: recordingSsh(requests),
      config: makeConfig({
        sshHostKey: PI_KEY,
        macMiniHost: "192.168.1.50",
        macMiniSshUser: "me",
        macMiniSshKeyPath: "/tmp/id_rsa",
        macMiniSshHostKey: MAC_KEY,
        rpiCliPath: "/opt/rpi/cli.js",
      }),
      now: () => 0,
    }).collect(new AbortController().signal);
    expect(requests.map((r) => [r.host, r.hostKey])).toEqual([
      ["192.168.1.50", MAC_KEY],
    ]);
  });
});

describe("getPiModel revision table", () => {
  it.each([
    [0xd04180, "Pi CM5"],
    [0xd04190, "Pi 500"],
    [0xc041a0, "Pi CM5 Lite"],
    [0xd04170, "Pi 5"],
  ])("decodes revision %i", (rev, model) => {
    expect(getPiModel(rev)).toBe(model);
  });

  it("ignores the warranty prefix on old-style codes", () => {
    expect(getPiModel(0x1000002)).toBe("Pi B Rev 1.0");
    expect(getPiModel(0x1000010)).toBe("Pi B+");
  });
});

describe("PiStatsCollector model from /proc/cpuinfo (direct SSH)", () => {
  // Pi 5 /proc/cpuinfo tail: no pigpiod on the Pi 5 family
  const PI5_CPUINFO = [
    "processor\t: 3",
    "BogoMIPS\t: 108.00",
    "Features\t: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp",
    "CPU implementer\t: 0x41",
    "CPU part\t: 0xd0b",
    "",
    "Revision\t: d04170",
    "Serial\t\t: 1234567890abcdef",
    "Model\t\t: Raspberry Pi 5 Model B Rev 1.0",
  ].join("\n");

  function directConfig(): RaspberryPiInstance {
    return makeConfig({ sshUser: "pi", sshKeyPath: "/tmp/pi_id_rsa" });
  }

  // answers the compound exec: cpuinfo is the 8th segment (after the 7
  // dynamic commands), os-release the 9th
  function cpuinfoSsh(cpuinfo: string): SshExecutor {
    return {
      exec: async (req) => {
        const subs = req.command.split(`; echo "${SSH_SEGMENT_DELIMITER}"; `);
        const segments = subs.map((sub) => {
          if (sub.includes("/proc/cpuinfo")) return cpuinfo;
          if (sub.includes("/proc/uptime")) return "12345.67 23456.78";
          return "";
        });
        return {
          stdout: segments.join(`\n${SSH_SEGMENT_DELIMITER}\n`),
          stderr: "",
          code: 0,
        };
      },
    };
  }

  const noPigpiod: PigpioClient = {
    connect: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  };

  it("decodes the Revision line when pigpiod is absent (Pi 5)", async () => {
    const collector = new PiStatsCollector({
      pigpio: noPigpiod,
      ssh: cpuinfoSsh(PI5_CPUINFO),
      config: directConfig(),
      now: () => 0,
    });
    const snap = await collector.collect(new AbortController().signal);
    // previously piModel "Unknown" and hwRevision null
    expect(snap.hwRevision).toBe(0xd04170);
    expect(snap.piModel).toBe("Pi 5");
    expect(snap.isRpi).toBe(true);
    expect(snap.pigpioError).toContain("ECONNREFUSED");

    // cached static info keeps the model on later polls
    const again = await collector.collect(new AbortController().signal);
    expect(again.piModel).toBe("Pi 5");
  });

  it("falls back to the Model text for a revision code it does not know", async () => {
    const collector = new PiStatsCollector({
      pigpio: noPigpiod,
      ssh: cpuinfoSsh(
        "Revision\t: d041f0\nModel\t\t: Raspberry Pi 9 Model Z Rev 1.0\n"
      ),
      config: directConfig(),
      now: () => 0,
    });
    const snap = await collector.collect(new AbortController().signal);
    expect(snap.hwRevision).toBe(0xd041f0);
    expect(snap.piModel).toBe("Raspberry Pi 9 Model Z Rev 1.0");
  });

  it("keeps the pigpiod revision when pigpiod answered", async () => {
    const collector = new PiStatsCollector({
      pigpio: fakePigpio(0),
      ssh: cpuinfoSsh(PI5_CPUINFO),
      config: directConfig(),
      now: () => 0,
    });
    const snap = await collector.collect(new AbortController().signal);
    expect(snap.hwRevision).toBe(0xc03111);
    expect(snap.piModel).toBe("Pi 4B");
  });
});
