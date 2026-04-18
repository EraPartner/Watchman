import { describe, it, expect } from 'vitest';
import { ServiceRegistry } from '../domain/ServiceRegistry.js';
import { BaseService, type Controllable, type HealthResult, type StatsResult, type PollPolicy } from '../domain/BaseService.js';
import { ok, err } from '../core/result.js';
import { UnavailableError, ValidationError } from '../core/errors.js';
import { GetServiceStatus } from './GetServiceStatus.js';
import { GetAggregatedHealth } from './GetAggregatedHealth.js';
import { ControlService } from './ControlService.js';
import { ListInstances } from './ListInstances.js';

class FakeSvc extends BaseService {
  readonly kind: string;
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy = { healthMs: 1000, statsMs: 2000 };
  constructor(kind: string, instanceId: string, private readonly healthy = true) {
    super();
    this.kind = kind;
    this.instanceId = instanceId;
  }
  async checkHealth(): Promise<HealthResult> {
    if (!this.healthy) return err(new UnavailableError('down'));
    return ok({ reachable: true, at: 1 });
  }
  async getStats(): Promise<StatsResult> {
    return ok({ metrics: { count: 1 }, at: 1 });
  }
}

class ControllableSvc extends FakeSvc implements Controllable {
  lastAction: string | null = null;
  async control(action: string) {
    this.lastAction = action;
    return ok<void>(undefined);
  }
}

const s = () => new AbortController().signal;

describe('GetServiceStatus', () => {
  it('health returns ok result', async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc('bitcoin', 'main'));
    const uc = new GetServiceStatus({ registry: r });
    const res = await uc.health('bitcoin', undefined, s());
    expect(res.ok).toBe(true);
  });

  it('stats by specific instance', async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc('bitcoin', 'a'));
    r.register(new FakeSvc('bitcoin', 'b'));
    const uc = new GetServiceStatus({ registry: r });
    const res = await uc.stats('bitcoin', 'b', s());
    expect(res.ok).toBe(true);
  });
});

describe('GetAggregatedHealth', () => {
  it('runs all services via allSettled', async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc('a', 'main', true));
    r.register(new FakeSvc('b', 'main', false));
    const uc = new GetAggregatedHealth(r);
    const out = await uc.run(s());
    expect(out).toHaveLength(2);
    expect(out[0]!.result.ok).toBe(true);
    expect(out[1]!.result.ok).toBe(false);
  });
});

describe('ControlService', () => {
  it('errors when not controllable', async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc('bitcoin', 'main'));
    const uc = new ControlService(r);
    const res = await uc.run('bitcoin', undefined, 'restart', s());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(ValidationError);
  });

  it('invokes control on controllable service', async () => {
    const r = new ServiceRegistry();
    const svc = new ControllableSvc('bitcoin', 'main');
    r.register(svc);
    const uc = new ControlService(r);
    const res = await uc.run('bitcoin', undefined, 'restart', s());
    expect(res.ok).toBe(true);
    expect(svc.lastAction).toBe('restart');
  });
});

describe('ListInstances', () => {
  it('returns per-kind and all', () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc('bitcoin', 'a'));
    r.register(new FakeSvc('bitcoin', 'b'));
    r.register(new FakeSvc('ipfs', 'main'));
    const uc = new ListInstances(r);
    expect(uc.byKind('bitcoin')).toHaveLength(2);
    expect(uc.all()).toHaveLength(3);
    expect(uc.kinds()).toEqual(expect.arrayContaining(['bitcoin', 'ipfs']));
  });
});
