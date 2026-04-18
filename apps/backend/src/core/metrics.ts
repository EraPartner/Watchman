import type { Breaker, BreakerMetrics } from '../infra/circuitBreaker/breaker.js';

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

export interface MetricsSnapshot {
  breakers: Record<string, BreakerMetrics>;
  poller: PollerStatsSnapshot | null;
  cache: Record<string, CacheStatsSnapshot>;
  process: {
    uptimeSec: number;
    rss: number;
    heapUsed: number;
  };
}

export interface MetricsRegistry {
  registerBreaker(b: Breaker): void;
  setPollerStats(src: PollerStatsSource): void;
  registerCache(name: string, src: CacheStatsSource): void;
  snapshot(): MetricsSnapshot;
}

export function createMetricsRegistry(): MetricsRegistry {
  const breakers = new Map<string, Breaker>();
  const caches = new Map<string, CacheStatsSource>();
  let pollerSrc: PollerStatsSource | null = null;

  return {
    registerBreaker(b) {
      breakers.set(b.name, b);
    },
    setPollerStats(src) {
      pollerSrc = src;
    },
    registerCache(name, src) {
      caches.set(name, src);
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
        process: {
          uptimeSec: Math.round(process.uptime()),
          rss: mem.rss,
          heapUsed: mem.heapUsed,
        },
      };
    },
  };
}
