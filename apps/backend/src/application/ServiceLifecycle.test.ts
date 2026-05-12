import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../domain/BaseService.js';
import { ok } from '../core/result.js';
import { createEventBus } from '../core/eventBus.js';
import { ServiceRegistry } from '../domain/ServiceRegistry.js';
import type { Poller } from '../infra/scheduler/poller.js';
import type { ConfigStore, StoredService } from '../config/store/ConfigStore.js';
import type { ServiceInfra } from '../bootstrap/registerServices.js';

class StubService extends BaseService {
  readonly pollPolicy: PollPolicy = { healthMs: 1000, statsMs: 2000 };
  constructor(
    readonly kind: string,
    readonly instanceId: string,
  ) {
    super();
  }
  async checkHealth(): Promise<HealthResult> {
    return ok({ reachable: true, at: 0 });
  }
  async getStats(): Promise<StatsResult> {
    return ok({ metrics: {}, at: 0 });
  }
}

// vi.mock is hoisted above the imports below by Vitest.
vi.mock('../bootstrap/registerServices.js', () => ({
  createService: (instance: { kind: string; instanceId: string }) =>
    new StubService(instance.kind, instance.instanceId),
}));

import { createServiceLifecycle } from './ServiceLifecycle.js';

function makeStoredService(
  id: string,
  kind: string,
  instanceId: string,
): StoredService {
  return {
    id,
    kind: kind as StoredService['kind'],
    instanceId,
    enabled: true,
    config: {
      kind,
      instanceId,
      enabled: true,
      pollPolicy: { healthMs: 1000, statsMs: 2000, jitterRatio: 0 },
      cacheTtlMs: 10_000,
      timeoutMs: 5_000,
    } as unknown as StoredService['config'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeStore(initial: Map<string, StoredService>): ConfigStore {
  return {
    async loadAll() {
      return Array.from(initial.values());
    },
    async get(id) {
      return initial.get(id) ?? null;
    },
    async create() {
      throw new Error('not used');
    },
    async update() {
      throw new Error('not used');
    },
    async delete() {
      throw new Error('not used');
    },
    redact(svc) {
      return {
        id: svc.id,
        kind: svc.kind,
        instanceId: svc.instanceId,
        enabled: svc.enabled,
        config: {},
        createdAt: svc.createdAt.toISOString(),
        updatedAt: svc.updatedAt.toISOString(),
      };
    },
    async listAudit() {
      return [];
    },
    async writeAudit() {},
    async exportAll() {
      return { version: 1, exportedAt: '', payload: '' };
    },
    async importBundle() {
      return { imported: 0, updated: 0, skipped: 0, errors: [] };
    },
  };
}

function makePoller(): Poller & {
  tracked: Set<string>;
  untracked: Array<string>;
} {
  const tracked = new Set<string>();
  const untracked: string[] = [];
  const poller: Poller = {
    track(svc) {
      tracked.add(svc.id);
    },
    untrack(id) {
      tracked.delete(id);
      untracked.push(id);
    },
    pause() {},
    resume() {},
    async stop() {},
    isRunning(id: string) {
      return tracked.has(id);
    },
    isPaused() {
      return false;
    },
  };
  return Object.assign(poller, { tracked, untracked });
}

const silentLogger = pino({ level: 'silent' });
const fakeInfra = {} as ServiceInfra;

describe('ServiceLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applyUpdate with renamed instanceId tears down old svc id and registers new', async () => {
    const storedId = 'stored-1';
    const initial = makeStoredService(storedId, 'ipfs', 'old');
    const records = new Map([[storedId, initial]]);
    const store = makeStore(records);
    const registry = new ServiceRegistry();
    const poller = makePoller();
    const bus = createEventBus();

    const lifecycle = createServiceLifecycle({
      store,
      registry,
      poller,
      bus,
      infra: fakeInfra,
      logger: silentLogger,
    });

    await lifecycle.start();

    // After reloadAll, the old service is registered.
    expect(registry.has('ipfs:old')).toBe(true);
    expect(registry.has('ipfs:new')).toBe(false);
    expect(poller.tracked.has('ipfs:old')).toBe(true);

    // Simulate the rename: stored row is now ipfs/new (same storedId).
    records.set(storedId, makeStoredService(storedId, 'ipfs', 'new'));
    await lifecycle.applyUpdate(storedId);

    expect(registry.has('ipfs:old')).toBe(false);
    expect(registry.has('ipfs:new')).toBe(true);
    expect(poller.tracked.has('ipfs:old')).toBe(false);
    expect(poller.tracked.has('ipfs:new')).toBe(true);
    expect(poller.untracked).toContain('ipfs:old');

    await lifecycle.stop();
  });

  it('idByStoredId reflects the new svc id after rename', async () => {
    const storedId = 'stored-2';
    const initial = makeStoredService(storedId, 'ipfs', 'before');
    const records = new Map([[storedId, initial]]);
    const store = makeStore(records);
    const registry = new ServiceRegistry();
    const poller = makePoller();
    const bus = createEventBus();

    const lifecycle = createServiceLifecycle({
      store,
      registry,
      poller,
      bus,
      infra: fakeInfra,
      logger: silentLogger,
    });

    await lifecycle.start();
    expect(lifecycle.idByStoredId(storedId)).toBe('ipfs:before');

    records.set(storedId, makeStoredService(storedId, 'ipfs', 'after'));
    await lifecycle.applyUpdate(storedId);

    expect(lifecycle.idByStoredId(storedId)).toBe('ipfs:after');

    await lifecycle.stop();
  });
});
