import { describe, it, expect, vi } from 'vitest';
import { systemClock, createFakeClock } from './clock.js';

describe('systemClock', () => {
  it('now returns a timestamp', () => {
    const a = systemClock.now();
    expect(typeof a).toBe('number');
    expect(a).toBeGreaterThan(0);
  });

  it('setTimeout fires and returns cancel', async () => {
    const fn = vi.fn();
    const cancel = systemClock.setTimeout(fn, 10);
    await new Promise((r) => setTimeout(r, 25));
    expect(fn).toHaveBeenCalledOnce();
    cancel();
  });

  it('cancel prevents execution', async () => {
    const fn = vi.fn();
    const cancel = systemClock.setTimeout(fn, 10);
    cancel();
    await new Promise((r) => setTimeout(r, 25));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('createFakeClock', () => {
  it('advances time and fires due timers in order', () => {
    const clock = createFakeClock(0);
    const order: string[] = [];
    clock.setTimeout(() => order.push('a'), 100);
    clock.setTimeout(() => order.push('b'), 50);
    clock.setTimeout(() => order.push('c'), 200);
    clock.advance(150);
    expect(order).toEqual(['b', 'a']);
    expect(clock.now()).toBe(150);
    clock.advance(100);
    expect(order).toEqual(['b', 'a', 'c']);
  });

  it('cancelled timers do not fire', () => {
    const clock = createFakeClock();
    const fn = vi.fn();
    const cancel = clock.setTimeout(fn, 10);
    cancel();
    clock.advance(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('set jumps to absolute time', () => {
    const clock = createFakeClock(1000);
    const fn = vi.fn();
    clock.setTimeout(fn, 500);
    clock.set(1500);
    expect(fn).toHaveBeenCalled();
  });
});
