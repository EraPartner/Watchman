import { describe, it, expect } from "vitest";
import { SnapshotCache } from "./SnapshotCache.js";
import { createEventBus } from "../core/eventBus.js";
import { createFakeClock } from "../core/clock.js";
import { createMetricsRegistry } from "../core/metrics.js";
import {
  BaseService,
  type HealthResult,
  type StatsResult,
  type PollPolicy,
} from "../domain/BaseService.js";
import { ok, err } from "../core/result.js";
import { UnavailableError } from "../core/errors.js";

class Stub extends BaseService {
  readonly kind = "stub";
  readonly instanceId = "main";
  readonly pollPolicy: PollPolicy = { healthMs: 1000, statsMs: 1000 };
  statsCalls = 0;
  async checkHealth(): Promise<HealthResult> {
    return ok({ reachable: true, at: 0 });
  }
  async getStats(): Promise<StatsResult> {
    this.statsCalls++;
    return ok({ metrics: { n: this.statsCalls }, at: this.statsCalls });
  }
}

const signal = () => new AbortController().signal;

describe("SnapshotCache", () => {
  it("serves poller-published health and clears on unregister", () => {
    const bus = createEventBus();
    const cache = new SnapshotCache({ bus, clock: createFakeClock() });
    cache.start();
    const svc = new Stub();
    cache.register(svc, 10_000);

    bus.emit("service.health.updated", {
      id: svc.id,
      kind: svc.kind,
      instanceId: svc.instanceId,
      at: 1,
      snapshot: { reachable: true, at: 1 },
    });
    expect(cache.latestHealth(svc.id)?.ok).toBe(true);

    bus.emit("service.error", {
      id: svc.id,
      kind: svc.kind,
      instanceId: svc.instanceId,
      scope: "health",
      error: new UnavailableError("down"),
      at: 2,
    });
    const errored = cache.latestHealth(svc.id);
    expect(errored?.ok).toBe(false);

    cache.unregister(svc.id);
    expect(cache.latestHealth(svc.id)).toBeUndefined();
    cache.stop();
  });

  it("ignores stats-scope errors for health state", () => {
    const bus = createEventBus();
    const cache = new SnapshotCache({ bus, clock: createFakeClock() });
    cache.start();
    const svc = new Stub();
    bus.emit("service.health.updated", {
      id: svc.id,
      kind: svc.kind,
      instanceId: svc.instanceId,
      at: 1,
      snapshot: { reachable: true, at: 1 },
    });
    bus.emit("service.error", {
      id: svc.id,
      kind: svc.kind,
      instanceId: svc.instanceId,
      scope: "stats",
      error: new UnavailableError("stats auth failed"),
      at: 2,
    });
    expect(cache.latestHealth(svc.id)?.ok).toBe(true);
    cache.stop();
  });

  it("serves cached stats within ttl and refetches after expiry", async () => {
    const bus = createEventBus();
    const clock = createFakeClock();
    const cache = new SnapshotCache({ bus, clock });
    cache.start();
    const svc = new Stub();
    cache.register(svc, 1_000);

    const first = await cache.stats(svc, signal());
    expect(first.ok).toBe(true);
    expect(svc.statsCalls).toBe(1);

    const second = await cache.stats(svc, signal());
    expect(second.ok).toBe(true);
    expect(svc.statsCalls).toBe(1);

    clock.advance(2_500);
    const third = await cache.stats(svc, signal());
    expect(third.ok).toBe(true);
    expect(svc.statsCalls).toBe(2);
    cache.stop();
  });

  it("uses poller-published stats without hitting the service", async () => {
    const bus = createEventBus();
    const cache = new SnapshotCache({ bus, clock: createFakeClock() });
    cache.start();
    const svc = new Stub();
    cache.register(svc, 10_000);

    bus.emit("service.stats.updated", {
      id: svc.id,
      kind: svc.kind,
      instanceId: svc.instanceId,
      at: 5,
      snapshot: { metrics: { fromPoller: true }, at: 5 },
    });

    const res = await cache.stats(svc, signal());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics).toEqual({ fromPoller: true });
    expect(svc.statsCalls).toBe(0);
    cache.stop();
  });

  it("registers cache metrics when a metrics registry is provided", async () => {
    const bus = createEventBus();
    const metrics = createMetricsRegistry();
    const cache = new SnapshotCache({ bus, clock: createFakeClock(), metrics });
    cache.start();
    const svc = new Stub();
    cache.register(svc, 10_000);
    await cache.stats(svc, signal());

    const snap = metrics.snapshot();
    expect(snap.cache[`${svc.id}:stats`]).toBeDefined();

    cache.unregister(svc.id);
    expect(metrics.snapshot().cache[`${svc.id}:stats`]).toBeUndefined();
    cache.stop();
  });

  it("falls back to live stats for unregistered services", async () => {
    const bus = createEventBus();
    const cache = new SnapshotCache({ bus, clock: createFakeClock() });
    const svc = new Stub();
    const res = await cache.stats(svc, signal());
    expect(res.ok).toBe(true);
    expect(svc.statsCalls).toBe(1);
  });

  it("maps stats fetch failures to domain errors", async () => {
    const bus = createEventBus();
    const cache = new SnapshotCache({ bus, clock: createFakeClock() });
    const svc = new (class extends Stub {
      override async getStats(): Promise<StatsResult> {
        return err(new UnavailableError("nope"));
      }
    })();
    cache.register(svc, 1_000);
    const res = await cache.stats(svc, signal());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNAVAILABLE");
  });
});
