import { describe, it, expect } from 'vitest';
import { BaseService, isControllable, type HealthResult, type StatsResult, type PollPolicy } from './BaseService.js';
import { ok, type Result } from '../core/result.js';
import type { DomainError } from '../core/errors.js';

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

class Controlled extends Plain {
  async control(): Promise<Result<void, DomainError>> {
    return ok(undefined);
  }
}

describe('BaseService', () => {
  it('id combines kind and instanceId', () => {
    expect(new Plain().id).toBe('k:i');
  });

  it('isControllable detects control method', () => {
    expect(isControllable(new Plain())).toBe(false);
    expect(isControllable(new Controlled())).toBe(true);
  });
});
