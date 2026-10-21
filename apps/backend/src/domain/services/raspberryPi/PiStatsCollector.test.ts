import { describe, it, expect } from "vitest";
import { PiStatsCollector } from "./PiStatsCollector.js";
import { getPiModel } from "./piModel.js";
import type {
  PigpioClient,
  PigpioHandle,
} from "../../../infra/gpio/pigpioClient.js";
import type {
  SshExecutor,
  SshExecResult,
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
    sshUser: "",
    sshPort: 22,
    sshKeyPath: "",
    sshPassphrase: "",
    macMiniHost: "",
    macMiniSshPort: 22,
    macMiniSshUser: "",
    macMiniSshKeyPath: "",
    macMiniSshPassphrase: "",
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
