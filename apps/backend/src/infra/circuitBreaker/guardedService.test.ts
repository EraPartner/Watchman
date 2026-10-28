import { describe, it, expect } from "vitest";
import {
  BaseService,
  type HealthResult,
  type StatsResult,
  type PollPolicy,
} from "../../domain/BaseService.js";
import { ok, err } from "../../core/result.js";
import {
  UnauthorizedError,
  UnavailableError,
  ValidationError,
  type DomainError,
} from "../../core/errors.js";
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
  statsError: DomainError | undefined;

  async checkHealth(): Promise<HealthResult> {
    this.healthCalls++;
    return this.healthy
      ? ok({ reachable: true, at: 0 })
      : err(new UnavailableError("down"));
  }
  async getStats(): Promise<StatsResult> {
    this.statsCalls++;
    if (this.statsError !== undefined) return err(this.statsError);
    return ok({ metrics: {}, at: 0 });
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

  it("keeps reporting bad credentials while the breaker is open", async () => {
    const inner = new Stub();
    inner.statsError = new UnauthorizedError("login rejected");
    const { guarded, clock } = makeGuarded(inner);
    const signal = new AbortController().signal;

    const codes: string[] = [];
    const messages: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await guarded.getStats(signal);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        codes.push(res.error.code);
        messages.push(res.error.message);
      }
    }
    expect(codes).toEqual(Array(10).fill("UNAUTHORIZED"));
    expect(messages).toEqual(Array(10).fill("login rejected"));
    // the breaker still stops the login attempts at the threshold
    expect(inner.statsCalls).toBe(3);

    // one half-open probe per reset window, still reported as UNAUTHORIZED
    clock.advance(1001);
    for (let i = 0; i < 3; i++) {
      const res = await guarded.getStats(signal);
      if (!res.ok) expect(res.error.code).toBe("UNAUTHORIZED");
    }
    expect(inner.statsCalls).toBe(4);
  });

  it("keeps reporting a validation error while the breaker is open", async () => {
    const inner = new Stub();
    inner.statsError = new ValidationError("bad url");
    const { guarded } = makeGuarded(inner);
    const signal = new AbortController().signal;

    for (let i = 0; i < 5; i++) {
      const res = await guarded.getStats(signal);
      if (!res.ok) expect(res.error.code).toBe("VALIDATION");
    }
    expect(inner.statsCalls).toBe(3);
  });

  it("returns CIRCUIT_OPEN once fixed credentials hit a down service", async () => {
    const inner = new Stub();
    inner.statsError = new UnauthorizedError("login rejected");
    const { guarded, clock } = makeGuarded(inner);
    const signal = new AbortController().signal;

    for (let i = 0; i < 3; i++) await guarded.getStats(signal);
    clock.advance(1001);
    inner.statsError = new UnavailableError("down");
    await guarded.getStats(signal);
    const res = await guarded.getStats(signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CIRCUIT_OPEN");
  });

  it("preserves identity and poll policy", () => {
    const inner = new Stub();
    const { guarded } = makeGuarded(inner);
    expect(guarded.id).toBe(inner.id);
    expect(guarded.pollPolicy).toEqual(inner.pollPolicy);
  });

  // Watchman is monitoring-only: the wrapper must not forward any extra
  // method, so a stray control() on an inner service never becomes reachable.
  it("does not forward control() from the inner service", () => {
    const inner = Object.assign(new Stub(), {
      control: async () => ok<void>(undefined),
    });
    const { guarded } = makeGuarded(inner);
    expect("control" in guarded).toBe(false);
  });

  it("does not advertise lifecycle hooks the inner service lacks", () => {
    const inner = new Stub();
    const { guarded } = makeGuarded(inner);
    expect(guarded.onStart).toBeUndefined();
    expect(guarded.onStop).toBeUndefined();
  });
});
