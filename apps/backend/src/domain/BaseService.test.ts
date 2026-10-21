import { describe, it, expect } from 'vitest';
import { BaseService, type HealthResult, type StatsResult, type PollPolicy } from './BaseService.js';
import { ok } from '../core/result.js';

class Plain extends BaseService {
  readonly kind = 'k';
  readonly instanceId = 'i';
  readonly pollPolicy: PollPolicy = { healthMs: 1, statsMs: 2 };
  async checkHealth(): Promise<HealthResult> {
    return ok({ reachable: true, at: 0 });
  }
  async getStats(): Promise<StatsResult> {
    return ok({ metrics: {}, at: 0 });
  }
}

describe('BaseService', () => {
  it('id combines kind and instanceId', () => {
    expect(new Plain().id).toBe('k:i');
  });
});
