import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { buildServer } from "../server.js";
import { ServiceRegistry } from "../../../domain/ServiceRegistry.js";
import { GetServiceStatus } from "../../../application/GetServiceStatus.js";
import { GetAggregatedHealth } from "../../../application/GetAggregatedHealth.js";
import { ControlService } from "../../../application/ControlService.js";
import { ListInstances } from "../../../application/ListInstances.js";
import { createMetricsRegistry } from "../../../core/metrics.js";
import { ValidationError } from "../../../core/errors.js";
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
    listProfiles: vi.fn(async () => [makeProfile()]),
    getProfile: vi.fn(async () => makeProfile()),
    createProfile: vi.fn(async () => makeProfile()),
    updateProfile: vi.fn(async () => makeProfile()),
    deleteProfile: vi.fn(async () => undefined),
    serviceCounts: vi.fn(async () => ({ p1: 2 })),
    getActiveProfileId: vi.fn(async () => "p1"),
    setActiveProfileId: vi.fn(async () => undefined),
    getAutoSwitch: vi.fn(async () => true),
    setAutoSwitch: vi.fn(async () => undefined),
    getLastSignature: vi.fn(async () => undefined),
    setLastSignature: vi.fn(async () => undefined),
    ensureBootstrap: vi.fn(async () => undefined),
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
  const store = { loadAll: async () => [] } as unknown as ConfigStore;
  const lifecycle = {
    switchActiveProfile: vi.fn(async () => undefined),
    idByStoredId: vi.fn(() => undefined),
    ...opts.lifecycle,
  } as unknown as ServiceLifecycle;
  const detector: NetworkDetector = opts.detector ?? {
    detect: vi.fn(async () => ({})),
  };
  return buildServer({
    logger,
    services: {
      getStatus: new GetServiceStatus({ registry }),
      aggregated: new GetAggregatedHealth(registry),
      control: new ControlService(registry),
    },
    listInstances: new ListInstances(registry),
    metrics: createMetricsRegistry(),
    config: { store, lifecycle, registry },
    profiles: {
      profiles: makeProfileStore(opts.profiles),
      store,
      lifecycle,
      detector,
    },
    setup: {
      store,
      http: {
        send: async () => {
          throw new Error();
        },
      } as HttpClient,
    },
  });
}

describe("GET /profiles", () => {
  it("lists profiles with service counts and active flag", async () => {
    const app = await makeApp({});
    const res = await app.inject({ method: "GET", url: "/profiles" });
    await app.close();
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: Array<{ id: string; serviceCount: number; isActive: boolean }>;
    };
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
    const switchFn = vi.fn(async () => undefined);
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
      profiles: { getProfile: vi.fn(async () => undefined) },
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
        deleteProfile: vi.fn(async () => {
          throw new ValidationError("cannot delete the active profile");
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
      detector: { detect: vi.fn(async () => ({ gatewayMac: "aa:bb" })) },
      profiles: {
        listProfiles: vi.fn(async () => [
          makeProfile({
            id: "p1",
            networkSigs: [{ gatewayMac: "aa:bb", capturedAt: "x" }],
          }),
        ]),
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
    const updateFn = vi.fn(async () => makeProfile());
    const app = await makeApp({
      detector: {
        detect: vi.fn(async () => ({
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
      detector: { detect: vi.fn(async () => ({})) },
    });
    const res = await app.inject({
      method: "POST",
      url: "/profiles/p1/capture-network",
    });
    await app.close();
    expect(res.statusCode).toBe(409);
  });
});
