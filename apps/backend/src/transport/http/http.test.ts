import { describe, it, expect } from "vitest";
import pino from "pino";
import { buildServer } from "./server.js";
import { ServiceRegistry } from "../../domain/ServiceRegistry.js";
import { GetServiceStatus } from "../../application/GetServiceStatus.js";
import { GetAggregatedHealth } from "../../application/GetAggregatedHealth.js";
import { ControlService } from "../../application/ControlService.js";
import { ListInstances } from "../../application/ListInstances.js";
import { createMetricsRegistry } from "../../core/metrics.js";
import {
  BaseService,
  type Controllable,
  type HealthResult,
  type StatsResult,
  type PollPolicy,
} from "../../domain/BaseService.js";
import { ok, err } from "../../core/result.js";
import { UnavailableError } from "../../core/errors.js";
import type { ConfigStore } from "../../config/store/ConfigStore.js";
import type { ServiceLifecycle } from "../../application/ServiceLifecycle.js";
import type { HttpClient } from "../../infra/http/client.js";

class FakeSvc extends BaseService implements Controllable {
  readonly kind: string;
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy = { healthMs: 1000, statsMs: 2000 };
  constructor(
    kind: string,
    instanceId: string,
    private readonly healthy = true
  ) {
    super();
    this.kind = kind;
    this.instanceId = instanceId;
  }
  async checkHealth(): Promise<HealthResult> {
    return this.healthy
      ? ok({ reachable: true, at: 1 })
      : err(new UnavailableError("down"));
  }
  async getStats(): Promise<StatsResult> {
    return ok({ metrics: { count: 42 }, at: 1 });
  }
  async control(action: string) {
    if (action === "bad") return err(new UnavailableError("cannot control"));
    return ok<void>(undefined);
  }
}

async function makeApp(registry: ServiceRegistry) {
  const logger = pino({ level: "silent" });
  const fakeStore = { loadAll: async () => [] } as unknown as ConfigStore;
  const fakeLifecycle = {} as ServiceLifecycle;
  const fakeHttp = {
    send: async () => {
      throw new Error("not used in tests");
    },
  } as HttpClient;
  return buildServer({
    logger,
    services: {
      getStatus: new GetServiceStatus({ registry }),
      aggregated: new GetAggregatedHealth(registry),
      control: new ControlService(registry),
    },
    listInstances: new ListInstances(registry),
    metrics: createMetricsRegistry(),
    config: { store: fakeStore, lifecycle: fakeLifecycle, registry },
    profiles: {
      profiles: {} as never,
      store: fakeStore,
      lifecycle: fakeLifecycle,
      detector: { detect: async () => ({}) },
    },
    setup: { store: fakeStore, http: fakeHttp },
  });
}

describe("http routes", () => {
  it("GET /meta/health works", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({ method: "GET", url: "/meta/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });

  it("GET /services returns aggregated", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("a", "main", true));
    r.register(new FakeSvc("b", "main", false));
    const app = await makeApp(r);
    const res = await app.inject({ method: "GET", url: "/services" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data).toHaveLength(2);
    await app.close();
  });

  it("GET /services/:kind/health returns 404 for unknown kind", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({
      method: "GET",
      url: "/services/missing/health",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    await app.close();
  });

  it("GET /services/:kind/stats ok", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("bitcoin", "main"));
    const app = await makeApp(r);
    const res = await app.inject({
      method: "GET",
      url: "/services/bitcoin/stats",
    });
    expect(res.statusCode).toBe(200);
    expect(
      (res.json() as { data: { metrics: { count: number } } }).data.metrics
        .count
    ).toBe(42);
    await app.close();
  });

  it("GET /services/:kind/health maps domain error to 503", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("bitcoin", "main", false));
    const app = await makeApp(r);
    const res = await app.inject({
      method: "GET",
      url: "/services/bitcoin/health",
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
    await app.close();
  });

  it("POST /services/:kind/control rejects missing action", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("bitcoin", "main"));
    const app = await makeApp(r);
    const res = await app.inject({
      method: "POST",
      url: "/services/bitcoin/control",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("POST /services/:kind/control ok", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("bitcoin", "main"));
    const app = await makeApp(r);
    const res = await app.inject({
      method: "POST",
      url: "/services/bitcoin/control",
      payload: { action: "restart" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("GET /instances returns all", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("bitcoin", "a"));
    r.register(new FakeSvc("bitcoin", "b"));
    const app = await makeApp(r);
    const res = await app.inject({ method: "GET", url: "/instances" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: unknown[] }).data).toHaveLength(2);
    await app.close();
  });

  it("GET /instances/:kind filters by kind", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("bitcoin", "a"));
    r.register(new FakeSvc("ipfs", "main"));
    const app = await makeApp(r);
    const res = await app.inject({ method: "GET", url: "/instances/ipfs" });
    expect((res.json() as { data: unknown[] }).data).toHaveLength(1);
    await app.close();
  });

  it("GET /metrics returns snapshot", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      breakers: unknown;
      process: { uptimeSec: number };
    };
    expect(body.breakers).toBeDefined();
    expect(body.process.uptimeSec).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it("unknown route returns 404 JSON", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    await app.close();
  });

  it("GET /meta/version returns version and node fields", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({ method: "GET", url: "/meta/version" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { version: string; node: string };
    expect(body.node).toMatch(/^v\d+/);
    await app.close();
  });

  it("GET /kinds returns all registered kinds", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("bitcoin", "main"));
    r.register(new FakeSvc("ipfs", "main"));
    const app = await makeApp(r);
    const res = await app.inject({ method: "GET", url: "/kinds" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: string[] };
    expect(body.data).toContain("bitcoin");
    expect(body.data).toContain("ipfs");
    await app.close();
  });

  it("GET /services/:kind/health with instance query param returns specific instance", async () => {
    const r = new ServiceRegistry();
    r.register(new FakeSvc("bitcoin", "a", true));
    r.register(new FakeSvc("bitcoin", "b", false));
    const app = await makeApp(r);
    const res = await app.inject({
      method: "GET",
      url: "/services/bitcoin/health?instance=a",
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe("origin + host guards", () => {
  it("rejects a cross-origin request whose Origin is not allow-listed", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({
      method: "GET",
      url: "/meta/health",
      headers: { host: "localhost:3001", origin: "http://evil.example" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("allows a genuine same-origin request even off the CORS list (LAN deploy)", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({
      method: "GET",
      url: "/meta/health",
      headers: {
        host: "192.168.1.50:3001",
        origin: "http://192.168.1.50:3001",
      },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("rejects a request with an unrecognised Host (DNS rebinding)", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({
      method: "GET",
      url: "/meta/health",
      headers: { host: "attacker.example" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("allows a normal loopback request with no Origin", async () => {
    const app = await makeApp(new ServiceRegistry());
    const res = await app.inject({
      method: "GET",
      url: "/meta/health",
      headers: { host: "localhost:3001" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
