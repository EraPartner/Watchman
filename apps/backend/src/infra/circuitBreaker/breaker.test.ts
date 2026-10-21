import { describe, it, expect, vi } from 'vitest';
import { createBreaker } from './breaker.js';
import { createFakeClock } from '../../core/clock.js';
import { CircuitOpenError } from '../../core/errors.js';

describe('Breaker', () => {
  it('passes through successes', async () => {
    const clock = createFakeClock();
    const b = createBreaker('t', { failureThreshold: 3, resetAfterMs: 1000 }, clock);
    expect(await b.exec(async () => 1)).toBe(1);
    expect(b.metrics().successes).toBe(1);
    expect(b.metrics().state).toBe('closed');
  });

  it('trips after threshold and rejects further calls', async () => {
    const clock = createFakeClock();
    const b = createBreaker('t', { failureThreshold: 2, resetAfterMs: 1000 }, clock);
    const fail = async () => {
      throw new Error('x');
    };
    await expect(b.exec(fail)).rejects.toThrow('x');
    await expect(b.exec(fail)).rejects.toThrow('x');
    expect(b.metrics().state).toBe('open');
    expect(b.metrics().trips).toBe(1);
    await expect(b.exec(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(b.metrics().rejects).toBe(1);
  });

  it('enters half-open after reset and closes on success', async () => {
    const clock = createFakeClock();
    const b = createBreaker('t', { failureThreshold: 1, resetAfterMs: 500 }, clock);
    await expect(
      b.exec(async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow();
    expect(b.metrics().state).toBe('open');
    clock.advance(600);
    expect(await b.exec(async () => 'ok')).toBe('ok');
    expect(b.metrics().state).toBe('closed');
  });

  it('re-trips from half-open on failure', async () => {
    const clock = createFakeClock();
    const b = createBreaker('t', { failureThreshold: 1, resetAfterMs: 100 }, clock);
    const fail = vi.fn(async () => {
      throw new Error('x');
    });
    await expect(b.exec(fail)).rejects.toThrow();
    clock.advance(200);
    await expect(b.exec(fail)).rejects.toThrow();
    expect(b.metrics().state).toBe('open');
    expect(b.metrics().trips).toBe(2);
  });

  describe('concurrent callers', () => {
    const deferred = () => {
      let reject!: (e: Error) => void;
      let resolve!: (v: string) => void;
      const p = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { p, resolve, reject };
    };

    it('does not trip again when a call fails after another call tripped it', async () => {
      const clock = createFakeClock();
      const b = createBreaker('t', { failureThreshold: 1, resetAfterMs: 1000 }, clock);
      const slow = deferred();
      const slowCall = b.exec(() => slow.p);
      await expect(
        b.exec(async () => {
          throw new Error('fast');
        }),
      ).rejects.toThrow('fast');
      const openedAt = b.metrics().openedAt;
      clock.advance(500);
      slow.reject(new Error('slow'));
      await expect(slowCall).rejects.toThrow('slow');
      // Regression: the late failure tripped again, counting 2 trips and
      // moving openedAt, which delayed the half-open probe.
      expect(b.metrics().trips).toBe(1);
      expect(b.metrics().openedAt).toBe(openedAt);
    });

    it('lets only the half-open probe close or re-open the circuit', async () => {
      const clock = createFakeClock();
      const b = createBreaker('t', { failureThreshold: 1, resetAfterMs: 1000 }, clock);
      const stale = deferred();
      const staleCall = b.exec(() => stale.p); // acquired while closed
      await expect(
        b.exec(async () => {
          throw new Error('trip');
        }),
      ).rejects.toThrow('trip');
      clock.advance(1000);
      const probe = deferred();
      const probeCall = b.exec(() => probe.p); // half-open probe
      expect(b.metrics().state).toBe('half-open');

      stale.resolve('late');
      await expect(staleCall).resolves.toBe('late');
      expect(b.metrics().state).toBe('half-open');

      probe.reject(new Error('still down'));
      await expect(probeCall).rejects.toThrow('still down');
      expect(b.metrics().state).toBe('open');
      expect(b.metrics().trips).toBe(2);
    });
  });
});
