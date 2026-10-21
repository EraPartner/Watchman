import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";
import {
  BaseService,
  type HealthResult,
  type PollPolicy,
  type StatsResult,
} from "../domain/BaseService.js";
import { ok } from "../core/result.js";
import { createEventBus } from "../core/eventBus.js";
import { ServiceRegistry } from "../domain/ServiceRegistry.js";
import type { Poller } from "../infra/scheduler/poller.js";
import type {
  ConfigStore,
  StoredService,
} from "../config/store/ConfigStore.js";
import type { ProfileStore } from "../config/store/ProfileStore.js";
import type { ServiceInfra } from "../bootstrap/registerServices.js";

// Minimal ProfileStore stub: a single active profile "p1" that every test
// service belongs to, so the profile gate lets them run.
function makeProfiles(initialActive = "p1"): ProfileStore {
  let active: string | undefined = initialActive;
  return {
    listProfiles: async () => [],
    getProfile: async () => undefined,
    createProfile: async () => {
      throw new Error("not used");
    },
    updateProfile: async () => {
      throw new Error("not used");
    },
    deleteProfile: async () => {},
    serviceCounts: async () => ({}),
    getActiveProfileId: async () => active,
    setActiveProfileId: async (id: string) => {
      active = id;
    },
    getAutoSwitch: async () => true,
    setAutoSwitch: async () => {},
    getLastSignature: async () => undefined,
    setLastSignature: async () => {},
    ensureBootstrap: async () => {},
  } as unknown as ProfileStore;
}

class StubService extends BaseService {
  readonly pollPolicy: PollPolicy = { healthMs: 1000, statsMs: 2000 };
  constructor(
    readonly kind: string,
    readonly instanceId: string
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
vi.mock("../bootstrap/registerServices.js", () => ({
  createService: (instance: { kind: string; instanceId: string }) =>
    new StubService(instance.kind, instance.instanceId),
}));

import { createServiceLifecycle } from "./ServiceLifecycle.js";

function makeStoredService(
  id: string,
  kind: string,
  instanceId: string,
  profileId = "p1"
): StoredService {
  return {
    id,
    kind: kind as StoredService["kind"],
    instanceId,
    enabled: true,
    profileId,
    config: {
      kind,
      instanceId,
      enabled: true,
      pollPolicy: { healthMs: 1000, statsMs: 2000, jitterRatio: 0 },
      cacheTtlMs: 10_000,
      timeoutMs: 5_000,
    } as unknown as StoredService["config"],
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
      throw new Error("not used");
    },
    async update() {
      throw new Error("not used");
    },
    async delete() {
      throw new Error("not used");
    },
    async setProfile() {},
    redact(svc) {
      return {
        id: svc.id,
        kind: svc.kind,
        instanceId: svc.instanceId,
        enabled: svc.enabled,
        profileId: svc.profileId,
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
      return { version: 1, exportedAt: "", payload: "" };
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

const silentLogger = pino({ level: "silent" });
const fakeInfra = {} as ServiceInfra;

describe("ServiceLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applyUpdate with renamed instanceId tears down old svc id and registers new", async () => {
    const storedId = "stored-1";
    const initial = makeStoredService(storedId, "ipfs", "old");
    const records = new Map([[storedId, initial]]);
    const store = makeStore(records);
    const registry = new ServiceRegistry();
    const poller = makePoller();
    const bus = createEventBus();

    const lifecycle = createServiceLifecycle({
      store,
      profiles: makeProfiles(),
      registry,
      poller,
      bus,
      infra: fakeInfra,
      logger: silentLogger,
    });

    await lifecycle.start();

    // After reloadAll, the old service is registered.
    expect(registry.has("ipfs:old")).toBe(true);
    expect(registry.has("ipfs:new")).toBe(false);
    expect(poller.tracked.has("ipfs:old")).toBe(true);

    // Simulate the rename: stored row is now ipfs/new (same storedId).
    records.set(storedId, makeStoredService(storedId, "ipfs", "new"));
    await lifecycle.applyUpdate(storedId);

    expect(registry.has("ipfs:old")).toBe(false);
    expect(registry.has("ipfs:new")).toBe(true);
    expect(poller.tracked.has("ipfs:old")).toBe(false);
    expect(poller.tracked.has("ipfs:new")).toBe(true);
    expect(poller.untracked).toContain("ipfs:old");

    await lifecycle.stop();
  });

  it("idByStoredId reflects the new svc id after rename", async () => {
    const storedId = "stored-2";
    const initial = makeStoredService(storedId, "ipfs", "before");
    const records = new Map([[storedId, initial]]);
    const store = makeStore(records);
    const registry = new ServiceRegistry();
    const poller = makePoller();
    const bus = createEventBus();

    const lifecycle = createServiceLifecycle({
      store,
      profiles: makeProfiles(),
      registry,
      poller,
      bus,
      infra: fakeInfra,
      logger: silentLogger,
    });

    await lifecycle.start();
    expect(lifecycle.idByStoredId(storedId)).toBe("ipfs:before");

    records.set(storedId, makeStoredService(storedId, "ipfs", "after"));
    await lifecycle.applyUpdate(storedId);

    expect(lifecycle.idByStoredId(storedId)).toBe("ipfs:after");

    await lifecycle.stop();
  });

  it("only brings up services in the active profile, and switchActiveProfile reconciles", async () => {
    const a = makeStoredService("svc-a", "ipfs", "a", "p1");
    const b = makeStoredService("svc-b", "bitcoin", "b", "p2");
    const records = new Map([
      ["svc-a", a],
      ["svc-b", b],
    ]);
    const store = makeStore(records);
    const registry = new ServiceRegistry();
    const poller = makePoller();
    const bus = createEventBus();
    const switched: Array<{ profileId: string; reason: string }> = [];
    bus.on("profile.switched", (p) => switched.push(p));

    const lifecycle = createServiceLifecycle({
      store,
      profiles: makeProfiles("p1"),
      registry,
      poller,
      bus,
      infra: fakeInfra,
      logger: silentLogger,
    });

    await lifecycle.start();
    // Only the p1 service runs; the p2 service is never brought up.
    expect(registry.has("ipfs:a")).toBe(true);
    expect(registry.has("bitcoin:b")).toBe(false);

    await lifecycle.switchActiveProfile("p2");

    expect(registry.has("ipfs:a")).toBe(false);
    expect(registry.has("bitcoin:b")).toBe(true);
    expect(poller.untracked).toContain("ipfs:a");
    expect(switched).toEqual([{ profileId: "p2", reason: "manual" }]);

    await lifecycle.stop();
  });

  it("announces config:service.applied only after a created service is registered", async () => {
    const records = new Map<string, StoredService>();
    const store = makeStore(records);
    const registry = new ServiceRegistry();
    const poller = makePoller();
    const bus = createEventBus();

    const lifecycle = createServiceLifecycle({
      store,
      profiles: makeProfiles(),
      registry,
      poller,
      bus,
      infra: fakeInfra,
      logger: silentLogger,
    });
    await lifecycle.start();

    const applied = new Promise<{ registered: boolean; action: string }>(
      (resolve) => {
        bus.on("config:service.applied", (p) =>
          resolve({ registered: registry.has("ipfs:new"), action: p.action })
        );
      }
    );

    records.set("svc-new", makeStoredService("svc-new", "ipfs", "new"));
    bus.emit("config:service.created", {
      id: "svc-new",
      kind: "ipfs",
      instanceId: "new",
    });
    // Bring-up is async: the raw event fires before the registry has it.
    expect(registry.has("ipfs:new")).toBe(false);

    await expect(applied).resolves.toEqual({
      registered: true,
      action: "created",
    });

    await lifecycle.stop();
  });

  it("does not revive a service deleted while its update was reading the store", async () => {
    const storedId = "svc-race";
    const records = new Map([
      [storedId, makeStoredService(storedId, "ipfs", "race")],
    ]);
    const base = makeStore(records);
    // Hold the next store.get() open so the delete lands mid-read.
    let releaseGet: (() => void) | undefined;
    let holdNext = false;
    const store: ConfigStore = {
      ...base,
      async get(id) {
        const row = records.get(id) ?? null;
        if (holdNext) {
          holdNext = false;
          await new Promise<void>((r) => (releaseGet = r));
        }
        return row;
      },
    };
    const registry = new ServiceRegistry();
    const poller = makePoller();

    const lifecycle = createServiceLifecycle({
      store,
      profiles: makeProfiles(),
      registry,
      poller,
      bus: createEventBus(),
      infra: fakeInfra,
      logger: silentLogger,
    });
    await lifecycle.start();
    expect(registry.has("ipfs:race")).toBe(true);

    holdNext = true;
    const update = lifecycle.applyUpdate(storedId);
    await vi.waitFor(() => expect(releaseGet).toBeDefined());
    records.delete(storedId);
    const del = lifecycle.applyDelete(storedId);
    releaseGet!();
    await Promise.all([update, del]);

    expect(registry.has("ipfs:race")).toBe(false);
    expect(poller.tracked.has("ipfs:race")).toBe(false);
    expect(lifecycle.idByStoredId(storedId)).toBeUndefined();

    await lifecycle.stop();
  });

  it("does not run a created service from the old profile when a switch lands mid-create", async () => {
    const b = makeStoredService("svc-b", "bitcoin", "b", "p2");
    const records = new Map([["svc-b", b]]);
    const store = makeStore(records);
    const registry = new ServiceRegistry();
    const poller = makePoller();
    let active = "p1";
    // Reads after start() resolve in reverse call order, so the switch's read
    // of the new profile finishes before the create's read of the old one.
    const delays = [0, 20, 0];
    let reads = 0;
    const profiles = {
      ...makeProfiles(),
      getActiveProfileId: async () => {
        const value = active;
        const delay = delays[reads++] ?? 0;
        await new Promise((r) => setTimeout(r, delay));
        return value;
      },
      setActiveProfileId: async (id: string) => {
        active = id;
      },
    } as unknown as ProfileStore;

    const lifecycle = createServiceLifecycle({
      store,
      profiles,
      registry,
      poller,
      bus: createEventBus(),
      infra: fakeInfra,
      logger: silentLogger,
    });
    await lifecycle.start();

    records.set("svc-a", makeStoredService("svc-a", "ipfs", "a", "p1"));
    const created = lifecycle.applyCreate("svc-a");
    await new Promise((r) => setImmediate(r));
    await Promise.all([created, lifecycle.switchActiveProfile("p2")]);

    expect(registry.has("bitcoin:b")).toBe(true);
    expect(registry.has("ipfs:a")).toBe(false);

    await lifecycle.stop();
  });

  it("applyCreate is a no-op for a service reloadAll already brought up", async () => {
    const a = makeStoredService("svc-a", "ipfs", "a", "p1");
    const records = new Map([["svc-a", a]]);
    const registry = new ServiceRegistry();
    const lifecycle = createServiceLifecycle({
      store: makeStore(records),
      profiles: makeProfiles(),
      registry,
      poller: makePoller(),
      bus: createEventBus(),
      infra: fakeInfra,
      logger: silentLogger,
    });
    await lifecycle.start();

    await expect(lifecycle.applyCreate("svc-a")).resolves.toBeUndefined();
    expect(registry.has("ipfs:a")).toBe(true);
    expect(lifecycle.idByStoredId("svc-a")).toBe("ipfs:a");

    await lifecycle.stop();
  });
});
