import type { EventBus } from "../core/eventBus.js";
import type { Clock } from "../core/clock.js";
import type { MetricsRegistry } from "../core/metrics.js";
import {
  isDomainError,
  UnavailableError,
  type DomainError,
} from "../core/errors.js";
import { ok, err } from "../core/result.js";
import type {
  BaseService,
  HealthResult,
  StatsResult,
  StatsSnapshot,
} from "../domain/BaseService.js";
import { createSwrCache, type SwrCache } from "../infra/cache/swr.js";
import { withTimeout } from "../core/abort.js";

// Same as the poller's default probe timeout.
const DEFAULT_STATS_TIMEOUT_MS = 10_000;
// A read that finds no polled health yet probes live. Keep it under the
// frontend's 10 s request timeout so one unreachable host can't fail
// GET /services for every other service.
const LIVE_HEALTH_TIMEOUT_MS = 5_000;

export interface SnapshotCacheDeps {
  bus: EventBus;
  clock: Clock;
  metrics?: MetricsRegistry;
}

/**
 * Read-through cache between the HTTP layer and live services.
 *
 * - Health: keeps the latest poller-published health result per service so
 *   GET /services and GET /services/:kind/health serve cached state instead
 *   of fanning out live probes on every read (live probe only before the
 *   first poll completes).
 * - Stats: a per-instance SWR cache honoring the instance's `cacheTtlMs`,
 *   updated from poller publishes and used by GET /services/:kind/stats.
 */
export class SnapshotCache {
  private readonly health = new Map<string, HealthResult>();
  private readonly statsCaches = new Map<string, SwrCache<StatsSnapshot>>();
  private readonly statsTimeouts = new Map<string, number>();
  private readonly instances = new Map<string, BaseService>();
  private unsubs: Array<() => void> = [];

  constructor(private readonly deps: SnapshotCacheDeps) {}

  start(): void {
    if (this.unsubs.length > 0) return;
    this.unsubs.push(
      this.deps.bus.on("service.health.updated", (p) => {
        if (p.snapshot) this.health.set(p.id, ok(p.snapshot));
      }),
      this.deps.bus.on("service.error", (p) => {
        if (p.scope !== "health") return;
        this.health.set(p.id, err(toDomainError(p.error)));
      }),
      this.deps.bus.on("service.stats.updated", (p) => {
        if (p.snapshot) this.statsCaches.get(p.id)?.set(p.id, p.snapshot);
      })
    );
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  register(
    svc: BaseService,
    cacheTtlMs: number,
    timeoutMs = DEFAULT_STATS_TIMEOUT_MS
  ): void {
    const cache = createSwrCache<StatsSnapshot>(
      { ttlMs: cacheTtlMs, staleMs: cacheTtlMs },
      this.deps.clock,
      this.deps.bus
    );
    this.statsCaches.set(svc.id, cache);
    this.statsTimeouts.set(svc.id, timeoutMs);
    this.instances.set(svc.id, svc);
    this.deps.metrics?.registerCache(`${svc.id}:stats`, {
      snapshot: () => {
        const s = cache.stats();
        return { size: cache.size(), hits: s.hits, misses: s.misses };
      },
    });
  }

  unregister(svcId: string): void {
    this.statsCaches.delete(svcId);
    this.statsTimeouts.delete(svcId);
    this.instances.delete(svcId);
    this.health.delete(svcId);
    this.deps.metrics?.removeCache(`${svcId}:stats`);
  }

  latestHealth(svcId: string): HealthResult | undefined {
    return this.health.get(svcId);
  }

  setHealth(svcId: string, result: HealthResult): void {
    this.health.set(svcId, result);
  }

  /**
   * Health for a read: the polled result, or a bounded live probe before the
   * first poll. The live result is cached only if it is still the newest
   * thing known about this exact instance: not cut short (by the caller or
   * the time limit), the
   * instance not replaced or removed meanwhile, and no poll published first.
   */
  async readHealth(svc: BaseService, signal: AbortSignal): Promise<HealthResult> {
    const cached = this.health.get(svc.id);
    if (cached) return cached;
    const probeSignal = withTimeout(LIVE_HEALTH_TIMEOUT_MS, signal);
    const live = await svc.checkHealth(probeSignal);
    if (
      !probeSignal.aborted &&
      this.instances.get(svc.id) === svc &&
      !this.health.has(svc.id)
    ) {
      this.health.set(svc.id, live);
    }
    return live;
  }

  async stats(svc: BaseService, signal: AbortSignal): Promise<StatsResult> {
    const cache = this.statsCaches.get(svc.id);
    if (!cache) return svc.getStats(signal);
    const timeoutMs =
      this.statsTimeouts.get(svc.id) ?? DEFAULT_STATS_TIMEOUT_MS;
    try {
      // The fetch is shared by every concurrent caller (and by a background
      // revalidation), so it must not run on one caller's signal: a client
      // that disconnects would otherwise fail every other waiter. Each caller
      // stops waiting on its own signal; the fetch has its own timeout.
      const shared = cache.get(svc.id, async (fetchSignal) => {
        const res = await svc.getStats(withTimeout(timeoutMs, fetchSignal));
        if (!res.ok) throw res.error;
        return res.value;
      });
      const value = await untilAborted(shared, signal);
      return ok(value);
    } catch (e) {
      return err(toDomainError(e));
    }
  }
}

function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    p.catch(() => undefined);
    return Promise.reject(abortError(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      }
    );
  });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new UnavailableError("stats request aborted");
}

function toDomainError(e: unknown): DomainError {
  if (isDomainError(e)) return e;
  return new UnavailableError(e instanceof Error ? e.message : String(e));
}
