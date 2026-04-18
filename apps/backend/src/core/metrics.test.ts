import { describe, it, expect } from 'vitest';
import { createMetricsRegistry } from './metrics.js';
import { createBreaker } from '../infra/circuitBreaker/breaker.js';
import { systemClock } from './clock.js';

describe('MetricsRegistry', () => {
  it('snapshots registered breakers', () => {
    const reg = createMetricsRegistry();
    const b = createBreaker('bitcoin', { failureThreshold: 3, resetAfterMs: 1000 }, systemClock);
    reg.registerBreaker(b);
    const snap = reg.snapshot();
    expect(snap.breakers.bitcoin).toBeDefined();
    expect(snap.breakers.bitcoin!.state).toBe('closed');
  });

  it('includes poller stats when set', () => {
    const reg = createMetricsRegistry();
    reg.setPollerStats({ snapshot: () => ({ tracked: 7 }) });
    expect(reg.snapshot().poller).toEqual({ tracked: 7 });
  });

  it('includes cache stats by name', () => {
    const reg = createMetricsRegistry();
    reg.registerCache('services', { snapshot: () => ({ size: 2, hits: 10, misses: 3 }) });
    const snap = reg.snapshot();
    expect(snap.cache.services).toEqual({ size: 2, hits: 10, misses: 3 });
  });

  it('includes process info', () => {
    const reg = createMetricsRegistry();
    const p = reg.snapshot().process;
    expect(p.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(p.rss).toBeGreaterThan(0);
  });
});
