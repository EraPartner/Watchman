import { describe, it, expect } from "vitest";
import { withHostPing } from "./health.js";
import type { ServiceHealth } from "./BaseService.js";
import type { PingProber } from "../infra/net/pingProbe.js";

const signal = new AbortController().signal;

function fakePing(success: boolean): PingProber {
  return {
    probe: async () =>
      success ? { success: true, avgMs: 5 } : { success: false },
  };
}

function probe(reachable: boolean): (s: AbortSignal) => Promise<ServiceHealth> {
  return async () => ({ reachable, ...(reachable ? { latencyMs: 7 } : {}) });
}

async function run(host: boolean, service: boolean) {
  const res = await withHostPing(
    { host: "h", timeoutMs: 100, pingCount: 1, prober: fakePing(host) },
    probe(service),
    0,
    signal
  );
  if (!res.ok) throw new Error("withHostPing should always resolve ok()");
  return res.value;
}

describe("withHostPing reachable derivation (ADR-026)", () => {
  it("host up + service up → reachable", async () => {
    const v = await run(true, true);
    expect(v.reachable).toBe(true);
    expect(v.host?.reachable).toBe(true);
    expect(v.service?.reachable).toBe(true);
  });

  // The bug fix: an ICMP-blocked/filtered host whose daemon answers must NOT
  // be reported unreachable. Under the old `host && service` rule this was false.
  it("host DOWN + service up → reachable (service-tier wins)", async () => {
    const v = await run(false, true);
    expect(v.reachable).toBe(true);
    expect(v.host?.reachable).toBe(false);
    expect(v.service?.reachable).toBe(true);
  });

  it("host up + service down → unreachable (daemon crashed)", async () => {
    const v = await run(true, false);
    expect(v.reachable).toBe(false);
    expect(v.host?.reachable).toBe(true);
    expect(v.service?.reachable).toBe(false);
  });

  it("host down + service down → unreachable", async () => {
    const v = await run(false, false);
    expect(v.reachable).toBe(false);
  });

  it("populates latencyMs from the service tier when present", async () => {
    const v = await run(true, true);
    expect(v.latencyMs).toBe(7);
  });
});
