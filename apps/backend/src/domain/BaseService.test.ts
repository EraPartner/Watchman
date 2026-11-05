import { describe, it, expect } from 'vitest';
import { BaseService, type HealthResult, type StatsResult, type PollPolicy } from './BaseService.js';
import { ok } from '../core/result.js';

class Plain extends BaseService {
  readonly kind = 'k';
  readonly instanceId = 'i';
  readonly pollPolicy: PollPolicy = { healthMs: 1, statsMs: 2 };
  checkHealth(): Promise<HealthResult> {
    return Promise.resolve(ok({ reachable: true, at: 0 }));
  }
  getStats(): Promise<StatsResult> {
    return Promise.resolve(ok({ metrics: {}, at: 0 }));
  }
}

describe('BaseService', () => {
  it('id combines kind and instanceId', () => {
    expect(new Plain().id).toBe('k:i');
  });
});
