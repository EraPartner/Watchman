import { describe, it, expect } from "vitest";
import { createService } from "./registerServices.js";
import type { ServiceInfra } from "./registerServices.js";
import type { HomebridgeInstance } from "../config/services.js";
import type { HttpClient } from "../infra/http/client.js";
import type { PingProber } from "../infra/net/pingProbe.js";

const baseCfg: HomebridgeInstance = {
  kind: "homebridge",
  instanceId: "main",
  enabled: true,
  pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
  cacheTtlMs: 10_000,
  timeoutMs: 5_000,
  baseUrl: "https://hb.local",
  username: "",
  password: "",
  authToken: "T",
  statusPath: "/api/status/server-information",
  versionPath: "/api/status/homebridge-version",
  loginPath: "/api/auth/login",
  allowSelfSigned: false,
};

/** HttpClient that records the tag of whichever client handled a request. */
function recordingHttp(tag: string, calls: string[]): HttpClient {
  return {
    async send() {
      calls.push(tag);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        text: async () => JSON.stringify({ hostname: "pi" }),
        json: async () => ({ hostname: "pi" }) as never,
      };
    },
  };
}

function infraWith(
  strict: HttpClient,
  insecure: HttpClient | undefined
): ServiceInfra {
  const ping: PingProber = {
    probe: async () => ({ success: true, avgMs: 5 }),
  };
  // Only the homebridge-relevant deps matter here; the rest are unused stubs.
  return {
    http: strict,
    ...(insecure ? { insecureHttp: insecure } : {}),
    ping,
    tcp: {} as ServiceInfra["tcp"],
    ssh: {} as ServiceInfra["ssh"],
    snmp: {} as ServiceInfra["snmp"],
    pigpio: {} as ServiceInfra["pigpio"],
    torControl: {} as ServiceInfra["torControl"],
    now: () => 1_000,
  };
}

describe("createService — homebridge TLS client selection", () => {
  it("routes through the permissive client when allowSelfSigned is true", async () => {
    const calls: string[] = [];
    const strict = recordingHttp("strict", calls);
    const insecure = recordingHttp("insecure", calls);
    const svc = createService(
      { ...baseCfg, allowSelfSigned: true },
      infraWith(strict, insecure)
    );

    await svc.checkHealth(new AbortController().signal);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls).not.toContain("strict");
    expect(new Set(calls)).toEqual(new Set(["insecure"]));
  });

  it("uses the strict client when allowSelfSigned is false", async () => {
    const calls: string[] = [];
    const strict = recordingHttp("strict", calls);
    const insecure = recordingHttp("insecure", calls);
    const svc = createService(
      { ...baseCfg, allowSelfSigned: false },
      infraWith(strict, insecure)
    );

    await svc.checkHealth(new AbortController().signal);

    expect(calls.length).toBeGreaterThan(0);
    expect(new Set(calls)).toEqual(new Set(["strict"]));
  });

  it("falls back to the strict client when no permissive client is wired", async () => {
    const calls: string[] = [];
    const strict = recordingHttp("strict", calls);
    const svc = createService(
      { ...baseCfg, allowSelfSigned: true },
      infraWith(strict, undefined)
    );

    await svc.checkHealth(new AbortController().signal);

    expect(new Set(calls)).toEqual(new Set(["strict"]));
  });
});
