import { describe, it, expect, vi } from 'vitest';
import { createSwrCache } from './swr.js';
import { createFakeClock } from '../../core/clock.js';

describe('SwrCache', () => {
  it('misses on first get then hits within ttl', async () => {
    const clock = createFakeClock(0);
    const cache = createSwrCache<number>({ ttlMs: 100, staleMs: 100 }, clock);
    const fetcher = vi.fn(async () => 42);
    expect(await cache.get('k', fetcher)).toBe(42);
    expect(await cache.get('k', fetcher)).toBe(42);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(1);
  });

  it('serves stale and triggers revalidation', async () => {
    const clock = createFakeClock(0);
    const cache = createSwrCache<number>({ ttlMs: 100, staleMs: 100 }, clock);
    let n = 1;
    const fetcher = vi.fn(async () => n++);
    await cache.get('k', fetcher);
    clock.advance(150);
    expect(await cache.get('k', fetcher)).toBe(1);
    expect(cache.stats().stale).toBe(1);
    await new Promise((r) => setImmediate(r));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('re-fetches after stale window expires', async () => {
    const clock = createFakeClock(0);
    const cache = createSwrCache<number>({ ttlMs: 50, staleMs: 50 }, clock);
    const fetcher = vi.fn(async () => 7);
    await cache.get('k', fetcher);
    clock.advance(200);
    await cache.get('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('dedups inflight requests', async () => {
    const clock = createFakeClock(0);
    const cache = createSwrCache<number>({ ttlMs: 100, staleMs: 0 }, clock);
    let resolve!: (v: number) => void;
    const fetcher = vi.fn(
      () => new Promise<number>((r) => (resolve = r)),
    );
    const p1 = cache.get('k', fetcher);
    const p2 = cache.get('k', fetcher);
    resolve(5);
    expect(await p1).toBe(5);
    expect(await p2).toBe(5);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('set, peek, delete, size work', () => {
    const clock = createFakeClock(0);
    const cache = createSwrCache<string>({ ttlMs: 100, staleMs: 0 }, clock);
    cache.set('a', 'x');
    expect(cache.peek('a')).toBe('x');
    expect(cache.size()).toBe(1);
    cache.delete('a');
    expect(cache.peek('a')).toBeUndefined();
  });
});
