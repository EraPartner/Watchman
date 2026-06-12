import { describe, it, expect } from "vitest";
import {
  BaseService,
  isControllable,
  type Controllable,
  type HealthResult,
  type StatsResult,
  type PollPolicy,
} from "../../domain/BaseService.js";
import { ok, err } from "../../core/result.js";
import { UnavailableError } from "../../core/errors.js";
import { createFakeClock } from "../../core/clock.js";
import { createBreaker } from "./breaker.js";
import { withBreakers } from "./guardedService.js";

class Stub extends BaseService {
  readonly kind = "stub";
  readonly instanceId = "main";
  readonly pollPolicy: PollPolicy = { healthMs: 1000, statsMs: 1000 };
  healthCalls = 0;
  statsCalls = 0;
  healthy = false;

  async checkHealth(): Promise<HealthResult> {
    this.healthCalls++;
    return this.healthy
      ? ok({ reachable: true, at: 0 })
      : err(new UnavailableError("down"));
  }
  async getStats(): Promise<StatsResult> {
    this.statsCalls++;
    return ok({ metrics: {}, at: 0 });
  }
}

class ControllableStub extends Stub implements Controllable {
  lastAction: string | null = null;
  async control(action: string) {
    this.lastAction = action;
    return ok<void>(undefined);
  }
}

function makeGuarded(inner: Stub, clock = createFakeClock()) {
  const health = createBreaker(
    "t:health",
    { failureThreshold: 3, resetAfterMs: 1000 },
    clock
  );
  const stats = createBreaker(
    "t:stats",
    { failureThreshold: 3, resetAfterMs: 1000 },
    clock
  );
  return {
    guarded: withBreakers(inner, { health, stats }),
    health,
    stats,
    clock,
  };
}

describe("withBreakers", () => {
  it("passes through successful results and result errors", async () => {
    const inner = new Stub();
    const { guarded } = makeGuarded(inner);
    const signal = new AbortController().signal;

    const fail = await guarded.checkHealth(signal);
    expect(fail.ok).toBe(false);
    if (!fail.ok) expect(fail.error.code).toBe("UNAVAILABLE");

    inner.healthy = true;
    const okRes = await guarded.checkHealth(signal);
    expect(okRes.ok).toBe(true);
  });

  it("opens after consecutive failures and stops probing the service", async () => {
    const inner = new Stub();
    const { guarded } = makeGuarded(inner);
    const signal = new AbortController().signal;

    for (let i = 0; i < 3; i++) await guarded.checkHealth(signal);
    expect(inner.healthCalls).toBe(3);

    const rejected = await guarded.checkHealth(signal);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("CIRCUIT_OPEN");
    expect(inner.healthCalls).toBe(3);
  });

  it("half-opens after resetAfterMs and closes on success", async () => {
    const inner = new Stub();
    const { guarded, clock } = makeGuarded(inner);
    const signal = new AbortController().signal;

    for (let i = 0; i < 3; i++) await guarded.checkHealth(signal);
    clock.advance(1001);
    inner.healthy = true;
    const recovered = await guarded.checkHealth(signal);
    expect(recovered.ok).toBe(true);
    expect(inner.healthCalls).toBe(4);
  });

  it("keeps health and stats breakers independent", async () => {
    const inner = new Stub();
    const { guarded } = makeGuarded(inner);
    const signal = new AbortController().signal;

    for (let i = 0; i < 4; i++) await guarded.checkHealth(signal);
    const stats = await guarded.getStats(signal);
    expect(stats.ok).toBe(true);
  });

  it("preserves identity, controllability and lifecycle hooks", async () => {
    const inner = new ControllableStub();
    const { guarded } = makeGuarded(inner);
    expect(guarded.id).toBe(inner.id);
    expect(guarded.pollPolicy).toEqual(inner.pollPolicy);
    expect(isControllable(guarded)).toBe(true);
    if (isControllable(guarded)) {
      await guarded.control("restart", new AbortController().signal);
    }
    expect(inner.lastAction).toBe("restart");
  });

  it("does not advertise lifecycle hooks the inner service lacks", () => {
    const inner = new Stub();
    const { guarded } = makeGuarded(inner);
    expect(guarded.onStart).toBeUndefined();
    expect(guarded.onStop).toBeUndefined();
    expect(isControllable(guarded)).toBe(false);
  });
});
