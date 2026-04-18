import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, map, mapErr } from './result.js';

describe('Result', () => {
  it('ok + isOk', () => {
    const r = ok(1);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (r.ok) expect(r.value).toBe(1);
  });

  it('err + isErr', () => {
    const r = err('bad');
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad');
  });

  it('map transforms ok only', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(map(err<string>('no'), (n: number) => n * 3)).toEqual(err('no'));
  });

  it('mapErr transforms err only', () => {
    expect(mapErr(err('a'), (s) => s + 'b')).toEqual(err('ab'));
    expect(mapErr(ok<number>(1), (s: string) => s + 'b')).toEqual(ok(1));
  });
});
