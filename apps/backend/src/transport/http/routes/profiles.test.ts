import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { buildServer } from "../server.js";
import { ServiceRegistry } from "../../../domain/ServiceRegistry.js";
import { GetServiceStatus } from "../../../application/GetServiceStatus.js";
import { GetAggregatedHealth } from "../../../application/GetAggregatedHealth.js";
import { ListInstances } from "../../../application/ListInstances.js";
import { createMetricsRegistry } from "../../../core/metrics.js";
import { NotFoundError, ValidationError } from "../../../core/errors.js";
import type { ConfigStore } from "../../../config/store/ConfigStore.js";
import type {
  Profile,
  ProfileStore,
} from "../../../config/store/ProfileStore.js";
import type { ServiceLifecycle } from "../../../application/ServiceLifecycle.js";
import type { NetworkDetector } from "../../../infra/net/gatewayDetect.js";
import type { HttpClient } from "../../../infra/http/client.js";

const NOW = new Date("2026-01-01T00:00:00Z");

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    name: "Home",
    networkSigs: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeProfileStore(overrides: Partial<ProfileStore> = {}): ProfileStore {
  return {
    listProfiles: vi.fn(() => Promise.resolve([makeProfile()])),
    getProfile: vi.fn(() => Promise.resolve(makeProfile())),
    createProfile: vi.fn(() => Promise.resolve(makeProfile())),
    updateProfile: vi.fn(() => Promise.resolve(makeProfile())),
    deleteProfile: vi.fn(() => Promise.resolve(undefined)),
    serviceCounts: vi.fn(() => Promise.resolve({ p1: 2 })),
    getActiveProfileId: vi.fn(() => Promise.resolve("p1")),
    setActiveProfileId: vi.fn(() => Promise.resolve(undefined)),
    getAutoSwitch: vi.fn(() => Promise.resolve(true)),
    setAutoSwitch: vi.fn(() => Promise.resolve(undefined)),
    getLastSignature: vi.fn(() => Promise.resolve(undefined)),
    setLastSignature: vi.fn(() => Promise.resolve(undefined)),
    ensureBootstrap: vi.fn(() => Promise.resolve(undefined)),
    ...overrides,
  };
}

function makeApp(opts: {
  profiles?: Partial<ProfileStore>;
  detector?: NetworkDetector;
  lifecycle?: Partial<ServiceLifecycle>;
}) {
  const logger = pino({ level: "silent" });
  const registry = new ServiceRegistry();
  const store = { loadAll: () => Promise.resolve([]) } as unknown as ConfigStore;
  const lifecycle = {
    switchActiveProfile: vi.fn(() => Promise.resolve(undefined)),
    idByStoredId: vi.fn(() => undefined),
    ...opts.lifecycle,
  } as unknown as ServiceLifecycle;
  const profileStore = makeProfileStore(opts.profiles);
  const detector: NetworkDetector = opts.detector ?? {
    detect: vi.fn(() => Promise.resolve({})),
  };
  return buildServer({
    logger,
    services: {
      getStatus: new GetServiceStatus({ registry }),
      aggregated: new GetAggregatedHealth(registry),
    },
    listInstances: new ListInstances(registry),
    metrics: createMetricsRegistry(),
    config: { store, lifecycle, registry, profiles: profileStore },
    profiles: {
      profiles: profileStore,
      store,
      lifecycle,
      detector,
    },
    setup: {
      store,
      http: {
        send: () => {
          return Promise.reject(new Error());
        },
      },
    },
  });
}

describe("GET /profiles", () => {
  it("lists profiles with service counts and active flag", async () => {
    const app = await makeApp({});
    const res = await app.inject({ method: "GET", url: "/profiles" });
    await app.close();
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      data: Array<{ id: string; serviceCount: number; isActive: boolean }>;
    }>();
    expect(body.data[0]).toMatchObject({
      id: "p1",
      serviceCount: 2,
      isActive: true,
    });
  });
});

describe("GET /profiles/active", () => {
  it("returns the active profile id and auto-switch setting", async () => {
    const app = await makeApp({});
    const res = await app.inject({ method: "GET", url: "/profiles/active" });
    await app.close();
    expect(res.json()).toMatchObject({
      data: { activeProfileId: "p1", autoSwitch: true },
    });
  });
});

describe("PUT /profiles/active", () => {
  it("switches the active profile via the lifecycle", async () => {
    const switchFn = vi.fn(() => Promise.resolve(undefined));
    const app = await makeApp({ lifecycle: { switchActiveProfile: switchFn } });
    const res = await app.inject({
      method: "PUT",
      url: "/profiles/active",
      payload: { profileId: "p1" },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(switchFn).toHaveBeenCalledWith("p1", "manual");
  });

  it("returns 404 for an unknown profile", async () => {
    const app = await makeApp({
      profiles: { getProfile: vi.fn(() => Promise.resolve(undefined)) },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/profiles/active",
      payload: { profileId: "ghost" },
    });
    await app.close();
    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /profiles/settings", () => {
  it("rejects a non-boolean autoSwitch", async () => {
    const app = await makeApp({});
    const res = await app.inject({
      method: "PUT",
      url: "/profiles/settings",
      payload: { autoSwitch: "yes" },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /profiles/:id", () => {
  it("maps invariant violations to 409", async () => {
    const app = await makeApp({
      profiles: {
        deleteProfile: vi.fn(() => {
          return Promise.reject(new ValidationError("cannot delete the active profile"));
        }),
      },
    });
    const res = await app.inject({ method: "DELETE", url: "/profiles/p1" });
    await app.close();
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "CONFLICT" } });
  });
});

describe("GET /profiles/current-network", () => {
  it("returns the detected signature and a matched profile", async () => {
    const app = await makeApp({
      detector: { detect: vi.fn(() => Promise.resolve({ gatewayMac: "aa:bb" })) },
      profiles: {
        listProfiles: vi.fn(() => Promise.resolve([
          makeProfile({
            id: "p1",
            networkSigs: [{ gatewayMac: "aa:bb", capturedAt: "x" }],
          }),
        ])),
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/profiles/current-network",
    });
    await app.close();
    expect(res.json()).toMatchObject({
      data: { signature: { gatewayMac: "aa:bb" }, matchedProfileId: "p1" },
    });
  });
});

describe("POST /profiles/:id/capture-network", () => {
  it("captures the current signature onto the profile", async () => {
    const updateFn = vi.fn(() => Promise.resolve(makeProfile()));
    const app = await makeApp({
      detector: {
        detect: vi.fn(() => Promise.resolve({
          gatewayMac: "aa:bb",
          gatewayIp: "1.1.1.1",
        })),
      },
      profiles: { updateProfile: updateFn },
    });
    const res = await app.inject({
      method: "POST",
      url: "/profiles/p1/capture-network",
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(updateFn).toHaveBeenCalled();
  });

  it("returns 409 when no network can be detected", async () => {
    const app = await makeApp({
      detector: { detect: vi.fn(() => Promise.resolve({})) },
    });
    const res = await app.inject({
      method: "POST",
      url: "/profiles/p1/capture-network",
    });
    await app.close();
    expect(res.statusCode).toBe(409);
  });
});

describe("PUT /profiles/:id", () => {
  it("returns 404 when the profile does not exist", async () => {
    const app = await makeApp({
      profiles: {
        updateProfile: vi.fn(() => {
          return Promise.reject(new NotFoundError("profile not found: nope"));
        }),
      },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/profiles/nope",
      payload: { name: "Office" },
    });
    await app.close();
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for a duplicate name even when the name contains 'not found'", async () => {
    const app = await makeApp({
      profiles: {
        updateProfile: vi.fn(() => {
          return Promise.reject(new ValidationError("profile name 'not found' already in use"));
        }),
      },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/profiles/p1",
      payload: { name: "not found" },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("VALIDATION");
  });
});
