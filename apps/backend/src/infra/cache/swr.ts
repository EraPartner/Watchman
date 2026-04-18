import { LRUCache } from 'lru-cache';
import type { Clock } from '../../core/clock.js';

export interface SwrPolicy {
  ttlMs: number;
  staleMs: number;
  max?: number;
}

export interface SwrCache<V> {
  get(key: string, fetcher: (signal: AbortSignal) => Promise<V>): Promise<V>;
  peek(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  size(): number;
  stats(): { hits: number; misses: number; stale: number; revalidations: number };
}

interface Entry<V> {
  value: V;
  freshUntil: number;
  staleUntil: number;
}

export function createSwrCache<V extends {}>(policy: SwrPolicy, clock: Clock): SwrCache<V> {
  const store = new LRUCache<string, Entry<V>>({ max: policy.max ?? 500 });
  const inflight = new Map<string, Promise<V>>();
  const counters = { hits: 0, misses: 0, stale: 0, revalidations: 0 };

  const fetchAndStore = async (
    key: string,
    fetcher: (signal: AbortSignal) => Promise<V>,
  ): Promise<V> => {
    const existing = inflight.get(key);
    if (existing) return existing;
    const controller = new AbortController();
    const p = (async () => {
      try {
        const value = await fetcher(controller.signal);
        const now = clock.now();
        store.set(key, {
          value,
          freshUntil: now + policy.ttlMs,
          staleUntil: now + policy.ttlMs + policy.staleMs,
        });
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  };

  return {
    async get(key, fetcher) {
      const now = clock.now();
      const entry = store.get(key);
      if (entry && entry.freshUntil > now) {
        counters.hits++;
        return entry.value;
      }
      if (entry && entry.staleUntil > now) {
        counters.stale++;
        counters.revalidations++;
        fetchAndStore(key, fetcher).catch(() => undefined);
        return entry.value;
      }
      counters.misses++;
      return fetchAndStore(key, fetcher);
    },
    peek(key) {
      return store.get(key)?.value;
    },
    set(key, value) {
      const now = clock.now();
      store.set(key, {
        value,
        freshUntil: now + policy.ttlMs,
        staleUntil: now + policy.ttlMs + policy.staleMs,
      });
    },
    delete(key) {
      store.delete(key);
    },
    size() {
      return store.size;
    },
    stats() {
      return { ...counters };
    },
  };
}
