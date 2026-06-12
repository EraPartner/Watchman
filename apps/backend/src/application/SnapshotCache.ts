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

  register(svc: BaseService, cacheTtlMs: number): void {
    const cache = createSwrCache<StatsSnapshot>(
      { ttlMs: cacheTtlMs, staleMs: cacheTtlMs },
      this.deps.clock,
      this.deps.bus
    );
    this.statsCaches.set(svc.id, cache);
    this.deps.metrics?.registerCache(`${svc.id}:stats`, {
      snapshot: () => {
        const s = cache.stats();
        return { size: cache.size(), hits: s.hits, misses: s.misses };
      },
    });
  }

  unregister(svcId: string): void {
    this.statsCaches.delete(svcId);
    this.health.delete(svcId);
    this.deps.metrics?.removeCache(`${svcId}:stats`);
  }

  latestHealth(svcId: string): HealthResult | undefined {
    return this.health.get(svcId);
  }

  setHealth(svcId: string, result: HealthResult): void {
    this.health.set(svcId, result);
  }

  async stats(svc: BaseService, signal: AbortSignal): Promise<StatsResult> {
    const cache = this.statsCaches.get(svc.id);
    if (!cache) return svc.getStats(signal);
    try {
      const value = await cache.get(svc.id, async () => {
        const res = await svc.getStats(signal);
        if (!res.ok) throw res.error;
        return res.value;
      });
      return ok(value);
    } catch (e) {
      return err(toDomainError(e));
    }
  }
}

function toDomainError(e: unknown): DomainError {
  if (isDomainError(e)) return e;
  return new UnavailableError(e instanceof Error ? e.message : String(e));
}
