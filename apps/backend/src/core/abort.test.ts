import { describe, it, expect } from 'vitest';
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
});
