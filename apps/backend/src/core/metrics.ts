import type {
  Breaker,
  BreakerMetrics,
} from "../infra/circuitBreaker/breaker.js";

export interface PollerStatsSnapshot {
  tracked: number;
}

export interface PollerStatsSource {
  snapshot(): PollerStatsSnapshot;
}

export interface CacheStatsSnapshot {
  size: number;
  hits: number;
  misses: number;
}

export interface CacheStatsSource {
  snapshot(): CacheStatsSnapshot;
}

export interface ServiceErrorStats {
  total: number;
  byService: Record<string, number>;
}

export interface MetricsSnapshot {
  breakers: Record<string, BreakerMetrics>;
  poller: PollerStatsSnapshot | null;
  cache: Record<string, CacheStatsSnapshot>;
  errors: ServiceErrorStats;
  process: {
    uptimeSec: number;
    rss: number;
    heapUsed: number;
  };
}

export interface MetricsRegistry {
  registerBreaker(b: Breaker): void;
  removeBreaker(name: string): void;
  setPollerStats(src: PollerStatsSource): void;
  registerCache(name: string, src: CacheStatsSource): void;
  removeCache(name: string): void;
  recordServiceError(serviceId: string): void;
  snapshot(): MetricsSnapshot;
}

export function createMetricsRegistry(): MetricsRegistry {
  const breakers = new Map<string, Breaker>();
  const caches = new Map<string, CacheStatsSource>();
  let pollerSrc: PollerStatsSource | null = null;

  const errorsByService = new Map<string, number>();
  let errorTotal = 0;

  return {
    registerBreaker(b) {
      breakers.set(b.name, b);
    },
    removeBreaker(name) {
      breakers.delete(name);
    },
    setPollerStats(src) {
      pollerSrc = src;
    },
    registerCache(name, src) {
      caches.set(name, src);
    },
    removeCache(name) {
      caches.delete(name);
    },
    recordServiceError(serviceId) {
      errorTotal++;
      errorsByService.set(serviceId, (errorsByService.get(serviceId) ?? 0) + 1);
    },
    snapshot() {
      const breakerMetrics: Record<string, BreakerMetrics> = {};
      for (const [name, b] of breakers) breakerMetrics[name] = b.metrics();
      const cacheMetrics: Record<string, CacheStatsSnapshot> = {};
      for (const [name, src] of caches) cacheMetrics[name] = src.snapshot();
      const mem = process.memoryUsage();
      return {
        breakers: breakerMetrics,
        poller: pollerSrc ? pollerSrc.snapshot() : null,
        cache: cacheMetrics,
        errors: {
          total: errorTotal,
          byService: Object.fromEntries(errorsByService),
        },
        process: {
          uptimeSec: Math.round(process.uptime()),
          rss: mem.rss,
          heapUsed: mem.heapUsed,
        },
      };
    },
  };
}
