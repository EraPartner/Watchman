import type { Logger } from 'pino';
import type { EventBus } from '../core/eventBus.js';
import type { BaseService } from '../domain/BaseService.js';
import type { ServiceRegistry } from '../domain/ServiceRegistry.js';
import type { Poller } from '../infra/scheduler/poller.js';
import type { ConfigStore, StoredService } from '../config/store/ConfigStore.js';
import { createService, type ServiceInfra } from '../bootstrap/registerServices.js';

export interface ServiceLifecycleOptions {
  store: ConfigStore;
  registry: ServiceRegistry;
  poller: Poller;
  bus: EventBus;
  infra: ServiceInfra;
  logger: Logger;
}

export interface ServiceLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  reloadAll(): Promise<void>;
  applyCreate(id: string): Promise<void>;
  applyUpdate(id: string): Promise<void>;
  applyDelete(id: string): Promise<void>;
  idByStoredId(storedId: string): string | undefined;
}

export function createServiceLifecycle(opts: ServiceLifecycleOptions): ServiceLifecycle {
  const { store, registry, poller, bus, infra, logger } = opts;
  const storedIdToSvcId = new Map<string, string>();
  const unsubs: Array<() => void> = [];

  // serialize queues async ops so they run one-at-a-time. Errors propagate to the
  // immediate awaiter, but chain-continuation errors are intentionally swallowed so
  // one failed op doesn't poison the queue for subsequent ops.
  let chain: Promise<void> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.catch(() => undefined).then(fn);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  async function teardown(svcId: string): Promise<void> {
    poller.untrack(svcId);
    const svc = registry.unregister(svcId);
    if (svc?.onStop) {
      try {
        await svc.onStop();
      } catch (e) {
        logger.error({ err: e, id: svcId }, 'service onStop failed');
      }
    }
  }

  async function bringUp(stored: StoredService): Promise<BaseService | null> {
    if (!stored.enabled) return null;
    const svc = createService(stored.config, infra);
    if (svc.onStart) {
      try {
        await svc.onStart();
      } catch (e) {
        logger.error({ err: e, id: svc.id }, 'service onStart failed');
      }
    }
    registry.register(svc);
    poller.track(svc);
    storedIdToSvcId.set(stored.id, svc.id);
    return svc;
  }

  async function applyCreate(id: string): Promise<void> {
    const stored = await store.get(id);
    if (!stored) return;
    await serialize(async () => {
      poller.pause();
      try {
        await bringUp(stored);
      } finally {
        poller.resume();
      }
    });
  }

  async function applyUpdate(id: string): Promise<void> {
    const stored = await store.get(id);
    if (!stored) return;
    await serialize(async () => {
      poller.pause();
      try {
        const prevSvcId = storedIdToSvcId.get(id);
        if (prevSvcId) {
          await teardown(prevSvcId);
          storedIdToSvcId.delete(id);
        }
        await bringUp(stored);
      } finally {
        poller.resume();
      }
    });
  }

  async function applyDelete(id: string): Promise<void> {
    await serialize(async () => {
      poller.pause();
      try {
        const svcId = storedIdToSvcId.get(id);
        if (svcId) {
          await teardown(svcId);
          storedIdToSvcId.delete(id);
        }
      } finally {
        poller.resume();
      }
    });
  }

  async function reloadAll(): Promise<void> {
    await serialize(async () => {
      poller.pause();
      try {
        for (const svcId of [...storedIdToSvcId.values()]) {
          await teardown(svcId);
        }
        storedIdToSvcId.clear();
        const all = await store.loadAll();
        for (const s of all) await bringUp(s);
      } finally {
        poller.resume();
      }
    });
  }

  return {
    async start(): Promise<void> {
      unsubs.push(
        bus.on('config:service.created', (p) => {
          void applyCreate(p.id).catch((e) =>
            logger.error({ err: e, id: p.id }, 'applyCreate failed'),
          );
        }),
      );
      unsubs.push(
        bus.on('config:service.updated', (p) => {
          void applyUpdate(p.id).catch((e) =>
            logger.error({ err: e, id: p.id }, 'applyUpdate failed'),
          );
        }),
      );
      unsubs.push(
        bus.on('config:service.deleted', (p) => {
          void applyDelete(p.id).catch((e) =>
            logger.error({ err: e, id: p.id }, 'applyDelete failed'),
          );
        }),
      );
      await reloadAll();
    },
    async stop(): Promise<void> {
      for (const u of unsubs) u();
      unsubs.length = 0;
      await serialize(async () => {
        for (const svcId of [...storedIdToSvcId.values()]) {
          await teardown(svcId);
        }
        storedIdToSvcId.clear();
      });
    },
    reloadAll,
    applyCreate,
    applyUpdate,
    applyDelete,
    idByStoredId(storedId: string): string | undefined {
      return storedIdToSvcId.get(storedId);
    },
  };
}
