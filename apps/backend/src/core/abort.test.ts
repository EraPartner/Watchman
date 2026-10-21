import { describe, it, expect, vi } from 'vitest';
import { linkAbort, withTimeout } from './abort.js';
import { TimeoutError } from './errors.js';

describe('linkAbort', () => {
  it('returns an unaborted signal with no inputs', () => {
    const s = linkAbort();
    expect(s.aborted).toBe(false);
  });

  it('aborts immediately if any input already aborted', () => {
    const c = new AbortController();
    c.abort(new Error('pre'));
    const s = linkAbort(c.signal);
    expect(s.aborted).toBe(true);
  });

  it('aborts when any linked source aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const s = linkAbort(a.signal, b.signal);
    b.abort(new Error('later'));
    expect(s.aborted).toBe(true);
  });
});

describe('withTimeout', () => {
  it('aborts with TimeoutError after ms', async () => {
    const s = withTimeout(10);
    await new Promise((r) => setTimeout(r, 30));
    expect(s.aborted).toBe(true);
    expect(s.reason).toBeInstanceOf(TimeoutError);
  });

  it('forwards parent abort reason', () => {
    const parent = new AbortController();
    parent.abort(new Error('parent'));
    const s = withTimeout(1000, parent.signal);
    expect(s.aborted).toBe(true);
  });

  it('parent abort later propagates', async () => {
    const parent = new AbortController();
    const s = withTimeout(1000, parent.signal);
    parent.abort(new Error('bye'));
    expect(s.aborted).toBe(true);
  });

  it('does not keep the event loop alive', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    withTimeout(60_000);
    const timer = spy.mock.results[0]!.value as NodeJS.Timeout;
    spy.mockRestore();
    expect(timer.hasRef()).toBe(false);
    clearTimeout(timer);
  });

  it('removes its listener from the parent once the timeout fires', async () => {
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const s = withTimeout(5, parent.signal);
    await new Promise((r) => setTimeout(r, 20));
    expect(s.reason).toBeInstanceOf(TimeoutError);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    // A later parent abort no longer reaches the already-timed-out signal.
    parent.abort(new Error('late'));
    expect(s.reason).toBeInstanceOf(TimeoutError);
  });
});
