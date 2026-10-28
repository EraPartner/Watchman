import type { Logger } from "pino";
import type { EventBus } from "../core/eventBus.js";
import type { BaseService } from "../domain/BaseService.js";
import type { ServiceRegistry } from "../domain/ServiceRegistry.js";
import { pollBudgetMs, type Poller } from "../infra/scheduler/poller.js";
import type {
  ConfigStore,
  StoredService,
} from "../config/store/ConfigStore.js";
import type { ProfileStore } from "../config/store/ProfileStore.js";
import {
  createService,
  type ServiceInfra,
} from "../bootstrap/registerServices.js";

export interface ServiceInstrumentation {
  /** Wrap a freshly created service (e.g. circuit breakers, cache registration). */
  wrap(svc: BaseService, stored: StoredService): BaseService;
  /** Release any per-service resources registered by wrap(). */
  release(svcId: string): void;
}

export interface ServiceLifecycleOptions {
  store: ConfigStore;
  profiles: ProfileStore;
  registry: ServiceRegistry;
  poller: Poller;
  bus: EventBus;
  infra: ServiceInfra;
  logger: Logger;
  instrument?: ServiceInstrumentation;
  onStartTimeoutMs?: number;
}

export interface ServiceLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  reloadAll(): Promise<void>;
  applyCreate(id: string): Promise<void>;
  applyUpdate(id: string): Promise<void>;
  applyDelete(id: string): Promise<void>;
  /** Persist the active profile, reconcile which services run, then announce the switch. */
  switchActiveProfile(id: string, reason?: "manual" | "auto"): Promise<void>;
  idByStoredId(storedId: string): string | undefined;
}

export function createServiceLifecycle(
  opts: ServiceLifecycleOptions
): ServiceLifecycle {
  const { store, profiles, registry, poller, bus, infra, logger } = opts;
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
      () => undefined
    );
    return next;
  };

  const onStartTimeoutMs = opts.onStartTimeoutMs ?? 10_000;

  async function teardown(svcId: string): Promise<void> {
    poller.untrack(svcId);
    const svc = registry.unregister(svcId);
    if (svc?.onStop) {
      try {
        await svc.onStop();
      } catch (e) {
        logger.error({ err: e, id: svcId }, "service onStop failed");
      }
    }
    opts.instrument?.release(svcId);
  }

  // A service runs only when enabled AND it belongs to the active profile
  // (ADR-027): out-of-profile services are never brought up, so they are not
  // polled or probed.
  function shouldRun(
    stored: StoredService,
    activeProfileId: string | undefined
  ): boolean {
    return stored.enabled && stored.profileId === activeProfileId;
  }

  async function bringUp(
    stored: StoredService,
    activeProfileId: string | undefined
  ): Promise<BaseService | null> {
    if (!shouldRun(stored, activeProfileId)) return null;
    const created = createService(stored.config, infra);
    const svc = opts.instrument
      ? opts.instrument.wrap(created, stored)
      : created;
    if (svc.onStart) {
      try {
        // onStart does real network I/O (Roon pairing, Tor ControlPort, …);
        // bound it so one hanging service cannot stall bring-up.
        const startP = svc.onStart();
        startP.catch((e) =>
          logger.error(
            { err: e, id: svc.id },
            "service onStart failed after timeout"
          )
        );
        await Promise.race([startP, rejectAfter(onStartTimeoutMs)]);
      } catch (e) {
        logger.error({ err: e, id: svc.id }, "service onStart failed");
      }
    }
    registry.register(svc);
    poller.track(svc, pollBudgetMs(stored.config.timeoutMs));
    storedIdToSvcId.set(stored.id, svc.id);
    return svc;
  }

  // Each apply* reads the stored row and active profile inside serialize():
  // reading first and queueing after let a delete that landed during the read
  // run its teardown first, after which the stale bring-up revived the
  // deleted service and polled it until restart.
  async function applyCreate(id: string): Promise<void> {
    await serialize(async () => {
      // reloadAll (e.g. a profile switch) may already have brought it up;
      // a second bringUp would start it, then fail to register, and leak it.
      if (storedIdToSvcId.has(id)) return;
      const stored = await store.get(id);
      if (!stored) return;
      const activeProfileId = await profiles.getActiveProfileId();
      poller.pause();
      try {
        await bringUp(stored, activeProfileId);
      } finally {
        poller.resume();
      }
    });
  }

  async function applyUpdate(id: string): Promise<void> {
    await serialize(async () => {
      const stored = await store.get(id);
      const activeProfileId = await profiles.getActiveProfileId();
      poller.pause();
      try {
        const prevSvcId = storedIdToSvcId.get(id);
        if (prevSvcId) {
          await teardown(prevSvcId);
          storedIdToSvcId.delete(id);
        }
        if (stored) await bringUp(stored, activeProfileId);
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
      const activeProfileId = await profiles.getActiveProfileId();
      poller.pause();
      try {
        for (const svcId of [...storedIdToSvcId.values()]) {
          await teardown(svcId);
        }
        storedIdToSvcId.clear();
        const all = await store.loadAll();
        // bring services up concurrently so one slow onStart doesn't delay
        // the rest; per-service failures are contained. bringUp() filters out
        // disabled and out-of-profile services.
        await Promise.all(
          all.map((s) =>
            bringUp(s, activeProfileId).catch((e) =>
              logger.error({ err: e, id: s.id }, "bringUp failed")
            )
          )
        );
      } finally {
        poller.resume();
      }
    });
  }

  async function switchActiveProfile(
    id: string,
    reason: "manual" | "auto" = "manual"
  ): Promise<void> {
    await profiles.setActiveProfileId(id);
    // reloadAll() re-reads the now-active profile and reconciles which services
    // run: out-of-profile ones are torn down, newly-in-profile ones brought up.
    await reloadAll();
    bus.emit("profile.switched", { profileId: id, reason });
  }

  // Clients refetch /instances when told a config changed. Announce only after
  // the registry reflects the change; the config:service.* events fire before
  // bring-up, so a refetch on those raced it and missed new services.
  function announceApplied(
    p: { id: string; kind: string; instanceId: string },
    action: "created" | "updated" | "deleted"
  ): void {
    bus.emit("config:service.applied", {
      id: p.id,
      kind: p.kind,
      instanceId: p.instanceId,
      action,
    });
  }

  return {
    async start(): Promise<void> {
      unsubs.push(
        bus.on("config:service.created", (p) => {
          void applyCreate(p.id)
            .catch((e) =>
              logger.error({ err: e, id: p.id }, "applyCreate failed")
            )
            .finally(() => announceApplied(p, "created"));
        })
      );
      unsubs.push(
        bus.on("config:service.updated", (p) => {
          void applyUpdate(p.id)
            .catch((e) =>
              logger.error({ err: e, id: p.id }, "applyUpdate failed")
            )
            .finally(() => announceApplied(p, "updated"));
        })
      );
      unsubs.push(
        bus.on("config:service.deleted", (p) => {
          void applyDelete(p.id)
            .catch((e) =>
              logger.error({ err: e, id: p.id }, "applyDelete failed")
            )
            .finally(() => announceApplied(p, "deleted"));
        })
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
    switchActiveProfile,
    idByStoredId(storedId: string): string | undefined {
      return storedIdToSvcId.get(storedId);
    },
  };
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const t = setTimeout(
      () => reject(new Error(`onStart timed out after ${ms}ms`)),
      ms
    );
    t.unref?.();
  });
}
