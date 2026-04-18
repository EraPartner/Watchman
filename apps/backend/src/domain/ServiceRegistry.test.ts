import { describe, it, expect } from 'vitest';
import { ServiceRegistry } from './ServiceRegistry.js';
import { BaseService, type HealthResult, type StatsResult, type PollPolicy } from './BaseService.js';
import { ok } from '../core/result.js';
import { NotFoundError } from '../core/errors.js';

class Stub extends BaseService {
  constructor(
    readonly kind: string,
    readonly instanceId: string,
  ) {
    super();
  }
  readonly pollPolicy: PollPolicy = { healthMs: 1000, statsMs: 2000 };
  async checkHealth(): Promise<HealthResult> {
    return ok({ reachable: true, at: 0 });
  }
  async getStats(): Promise<StatsResult> {
    return ok({ metrics: {}, at: 0 });
  }
}

describe('ServiceRegistry', () => {
  it('registers and retrieves by id', () => {
    const r = new ServiceRegistry();
    const s = new Stub('bitcoin', 'main');
    r.register(s);
    expect(r.get('bitcoin:main')).toBe(s);
  });

  it('rejects duplicate ids', () => {
    const r = new ServiceRegistry();
    r.register(new Stub('a', '1'));
    expect(() => r.register(new Stub('a', '1'))).toThrow(/duplicate/);
  });

  it('getByKind returns first when no instance specified', () => {
    const r = new ServiceRegistry();
    const s1 = new Stub('bitcoin', 'a');
    const s2 = new Stub('bitcoin', 'b');
    r.register(s1);
    r.register(s2);
    expect(r.getByKind('bitcoin')).toBe(s1);
    expect(r.getByKind('bitcoin', 'b')).toBe(s2);
  });

  it('throws NotFoundError for missing', () => {
    const r = new ServiceRegistry();
    expect(() => r.get('x:y')).toThrow(NotFoundError);
    expect(() => r.getByKind('x')).toThrow(NotFoundError);
    r.register(new Stub('k', 'a'));
    expect(() => r.getByKind('k', 'z')).toThrow(NotFoundError);
  });

  it('all, kinds, listKind return current state', () => {
    const r = new ServiceRegistry();
    r.register(new Stub('a', '1'));
    r.register(new Stub('b', '1'));
    expect(r.all()).toHaveLength(2);
    expect(new Set(r.kinds())).toEqual(new Set(['a', 'b']));
    expect(r.listKind('a')).toHaveLength(1);
    expect(r.listKind('zz')).toHaveLength(0);
  });
});
