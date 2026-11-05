import { describe, it, expect, vi, type Mock } from "vitest";
import { PhilipsBridgeService } from "./PhilipsBridgeService.js";
import type { PingProber, PingResult } from "../../../infra/net/pingProbe.js";
import type { PhilipsBridgeInstance } from "../../../config/services.js";
import type { HttpClient, HttpRequest } from "../../../infra/http/client.js";
import { UnauthorizedError } from "../../../core/errors.js";
import { required } from "../../../test/required.js";

/** A fake client whose send mock tests can read directly. */
type FakeHttp = { send: Mock<HttpClient["send"]> };

function makeConfig(
  overrides: Partial<PhilipsBridgeInstance> = {}
): PhilipsBridgeInstance {
  return {
    kind: "philipsBridge",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 3_000,
    host: "192.168.1.50",
    pingCount: 2,
    usePing: true,
    ...overrides,
  };
}

function fakePing(result: PingResult): PingProber {
  return { probe: () => Promise.resolve(result) };
}

function fakeHttp(status: number, body: unknown): FakeHttp {
  return {
    send: vi.fn<HttpClient["send"]>((_req: HttpRequest) => Promise.resolve({
      status,
      headers: {},
      text: () => Promise.resolve(JSON.stringify(body)),
      json: <T>() => Promise.resolve(body as T),
    })),
  };
}

describe("PhilipsBridgeService", () => {
  it("id is philipsBridge:main", () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: fakeHttp(200, {}),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe("philipsBridge:main");
  });

  it("reachable when ping succeeds", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true, avgMs: 5 }),
      http: fakeHttp(200, {}),
      config: makeConfig(),
      now: () => 3,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.latencyMs).toBe(5);
    }
  });

  it("unreachable when ping fails", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: false }),
      http: fakeHttp(200, {}),
      config: makeConfig(),
      now: () => 3,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it("getStats exposes host", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: fakeHttp(200, {}),
      config: makeConfig(),
      now: () => 9,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.host).toBe("192.168.1.50");
      expect(res.value.metrics.configured).toBe(true);
    }
  });

  it("usePing=false skips ICMP probe entirely", async () => {
    const probe = vi.fn(
      (): Promise<PingResult> => Promise.resolve({ success: true, avgMs: 5 })
    );
    const svc = new PhilipsBridgeService({
      ping: { probe },
      http: fakeHttp(200, {}),
      config: makeConfig({ usePing: false }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(probe).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.host?.reachable).toBe(false);
      expect(res.value.details?.icmpAlive).toBe(false);
      expect(res.value.details?.pingEnabled).toBe(false);
    }
  });

  it("usePing=false + applicationKey set: still probes API and reports service reachable", async () => {
    const probe = vi.fn(
      (): Promise<PingResult> => Promise.resolve({ success: true, avgMs: 5 })
    );
    const svc = new PhilipsBridgeService({
      ping: { probe },
      http: fakeHttp(200, { errors: [], data: [] }),
      config: makeConfig({ usePing: false, applicationKey: "k" }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(probe).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.host?.reachable).toBe(false);
      expect(res.value.service?.reachable).toBe(true);
      expect(res.value.reachable).toBe(true); // service alive overrides ping-disabled host
    }
  });
});

// ─── Hue API v2 (H1) ─────────────────────────────────────────────────────────

const HUE_LIGHTS_BODY = {
  errors: [],
  data: [
    {
      id: "a1",
      type: "light",
      on: { on: true },
      metadata: { name: "Bedroom" },
    },
    {
      id: "a2",
      type: "light",
      on: { on: false },
      metadata: { name: "Living Room" },
    },
    {
      id: "a3",
      type: "light",
      on: { on: true },
      metadata: { name: "Kitchen" },
    },
  ],
};

function hueConfig(
  overrides: Partial<PhilipsBridgeInstance> = {}
): PhilipsBridgeInstance {
  return makeConfig({ applicationKey: "test-app-key", ...overrides });
}

describe("PhilipsBridgeService Hue API v2 (H1)", () => {
  it("getStats returns lightCount and onCount from /clip/v2/resource/light", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: fakeHttp(200, HUE_LIGHTS_BODY),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.lightCount).toBe(3);
      expect(res.value.metrics.onCount).toBe(2);
    }
  });

  it("getStats includes offCount", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: fakeHttp(200, HUE_LIGHTS_BODY),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.offCount).toBe(1);
  });

  it("uses hue-application-key header in request", async () => {
    const http = fakeHttp(200, HUE_LIGHTS_BODY);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    await svc.getStats(new AbortController().signal);
    const calls = vi.mocked(http.send).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const headers = required(calls[0])[0].headers ?? {};
    expect(headers["hue-application-key"]).toBe("test-app-key");
  });

  it("calls /clip/v2/resource/light endpoint", async () => {
    const http = fakeHttp(200, HUE_LIGHTS_BODY);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    await svc.getStats(new AbortController().signal);
    const url = required(vi.mocked(http.send).mock.calls[0])[0].url;
    expect(url).toContain("/clip/v2/resource/light");
  });

  it("service reachable when API returns 200", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: false }),
      http: fakeHttp(200, HUE_LIGHTS_BODY),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.service?.reachable).toBe(true);
      expect(res.value.reachable).toBe(true); // service alive → overall reachable
    }
  });

  it("health probes the small bridge resource, reads its body and times the API call", async () => {
    let t = 0;
    let bodyRead = false;
    const http: HttpClient = {
      send: vi.fn((_req: HttpRequest) => {
        t += 40;
        return Promise.resolve({
          status: 200,
          headers: {},
          text: () => {
            bodyRead = true;
            return Promise.resolve("{}");
          },
          json: <T>() => {
            bodyRead = true;
            return Promise.resolve({} as T);
          },
        });
      }),
    };
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: false }),
      http,
      config: hueConfig({ usePing: false }),
      now: () => t,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    const url = required(vi.mocked(http.send).mock.calls[0])[0].url;
    expect(url).toContain("/clip/v2/resource/bridge");
    expect(bodyRead).toBe(true);
    expect(res.ok && res.value.latencyMs).toBe(40);
  });

  it("service unreachable when API call throws", async () => {
    const http: HttpClient = {
      send: vi.fn(() => {
        return Promise.reject(new Error("connection refused"));
      }),
    };
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: false }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.service?.reachable).toBe(false);
      expect(res.value.reachable).toBe(false);
    }
  });

  it("graceful when no applicationKey — no API call, basic metrics only", async () => {
    const http = fakeHttp(200, HUE_LIGHTS_BODY);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: makeConfig(), // no applicationKey
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.lightCount).toBeUndefined();
      expect(vi.mocked(http.send)).not.toHaveBeenCalled();
    }
  });

  it("getStats reports UNAVAILABLE when every API read fails, not a snapshot of blanks", async () => {
    const http: HttpClient = {
      send: vi.fn(() => {
        return Promise.reject(new Error("network error"));
      }),
    };
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
      // no certHash in this config: the message says how to fix it
      expect(res.error.message).toMatch(/re-pair the bridge/);
    }
  });

  it("with a key, a bridge that answers ping but not the API is not reachable", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true, avgMs: 3 }),
      http: fakeHttp(503, {}),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.host?.reachable).toBe(true);
      expect(res.value.reachable).toBe(false);
      expect(res.value.message).toMatch(/certificate fingerprint/);
    }
  });
});

describe("PhilipsBridgeService extended resources + eventstream", () => {
  // route-aware HTTP fake: responds per CLIP v2 resource path
  function routedHttp(routes: Record<string, unknown>): FakeHttp {
    return {
      send: vi.fn<HttpClient["send"]>((req: HttpRequest) => {
        const path = new URL(req.url).pathname;
        const body = routes[path];
        if (body === undefined) {
          return Promise.resolve({
            status: 404,
            headers: {},
            text: () => Promise.resolve(""),
            json: <T>() => Promise.resolve(({}) as T),
          });
        }
        return Promise.resolve({
          status: 200,
          headers: {},
          text: () => Promise.resolve(JSON.stringify(body)),
          json: <T>() => Promise.resolve(body as T),
        });
      }),
    };
  }

  const ROUTES: Record<string, unknown> = {
    "/clip/v2/resource/light": {
      data: [
        { id: "l1", type: "light", on: { on: true } },
        { id: "l2", type: "light", on: { on: false } },
      ],
    },
    "/clip/v2/resource/zigbee_connectivity": {
      data: [
        { id: "z1", type: "zigbee_connectivity", status: "connected" },
        { id: "z2", type: "zigbee_connectivity", status: "connectivity_issue" },
      ],
    },
    "/clip/v2/resource/device_power": {
      data: [
        {
          id: "p1",
          type: "device_power",
          power_state: { battery_state: "normal", battery_level: 80 },
        },
        {
          id: "p2",
          type: "device_power",
          power_state: { battery_state: "low", battery_level: 12 },
        },
      ],
    },
    "/clip/v2/resource/device": {
      data: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
    },
    "/clip/v2/resource/room": { data: [{ id: "r1" }, { id: "r2" }] },
  };

  it("getStats reports connectivity, battery, device and room telemetry", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: routedHttp(ROUTES),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        lightCount: 2,
        onCount: 1,
        offCount: 1,
        zigbeeUnreachableCount: 1,
        batteryLowCount: 1,
        minBatteryPercent: 12,
        deviceCount: 3,
        roomCount: 2,
        sseConnected: false,
      });
    }
  });

  it("names the unreachable and low-battery devices", async () => {
    const routes: Record<string, unknown> = {
      ...ROUTES,
      "/clip/v2/resource/zigbee_connectivity": {
        data: [
          {
            id: "z1",
            status: "connected",
            owner: { rid: "d1", rtype: "device" },
          },
          {
            id: "z2",
            status: "connectivity_issue",
            owner: { rid: "d2", rtype: "device" },
          },
        ],
      },
      "/clip/v2/resource/device_power": {
        data: [
          {
            id: "p1",
            owner: { rid: "d1" },
            power_state: { battery_state: "normal", battery_level: 80 },
          },
          {
            id: "p2",
            owner: { rid: "d3" },
            power_state: { battery_state: "low", battery_level: 12 },
          },
        ],
      },
      "/clip/v2/resource/device": {
        data: [
          { id: "d1", metadata: { name: "Hall switch" } },
          { id: "d2", metadata: { name: "Desk lamp" } },
          { id: "d3", product_data: { product_name: "Hue motion sensor" } },
        ],
      },
    };
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: routedHttp(routes),
      config: hueConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.unreachableDevices).toEqual([
        { name: "Desk lamp", status: "connectivity_issue" },
      ]);
      expect(res.value.metrics.lowBatteryDevices).toEqual([
        { name: "Hue motion sensor", level: 12 },
      ]);
    }
  });

  it("resource inventories ride the slow lane (memoized across polls)", async () => {
    const http = routedHttp(ROUTES);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
    });
    await svc.getStats(new AbortController().signal);
    await svc.getStats(new AbortController().signal);
    const urls = vi
      .mocked(http.send)
      .mock.calls.map(([req]) => new URL(req.url).pathname);
    expect(urls.filter((u) => u === "/clip/v2/resource/device").length).toBe(1);
    expect(
      urls.filter((u) => u === "/clip/v2/resource/zigbee_connectivity").length
    ).toBe(1);
  });

  it("serves light counts from SSE state without fetching once seeded", async () => {
    let emit: ((data: string) => void) | undefined;
    const http = routedHttp(ROUTES);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
      sse: (opts) => {
        emit = opts.onMessage;
      },
    });
    await svc.onStart();
    expect(emit).toBeDefined();
    // the stream is up before the first poll
    emit?.(JSON.stringify([{ type: "update", data: [] }]));

    // first poll fetches and seeds the live map
    await svc.getStats(new AbortController().signal);

    // bridge pushes l2 on; sse becomes healthy
    emit?.(
      JSON.stringify([
        {
          type: "update",
          data: [{ id: "l2", type: "light", on: { on: true } }],
        },
      ])
    );

    const before = vi
      .mocked(http.send)
      .mock.calls.filter(
        ([req]) => new URL(req.url).pathname === "/clip/v2/resource/light"
      ).length;
    const res = await svc.getStats(new AbortController().signal);
    const after = vi
      .mocked(http.send)
      .mock.calls.filter(
        ([req]) => new URL(req.url).pathname === "/clip/v2/resource/light"
      ).length;

    expect(after).toBe(before); // no extra light fetch
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.lightCount).toBe(2);
      expect(res.value.metrics.onCount).toBe(2);
      expect(res.value.metrics.offCount).toBe(0);
      expect(res.value.metrics.sseConnected).toBe(true);
    }
    await svc.onStop();
  });

  it("SSE delete events remove lights from the live counts", async () => {
    let emit: ((data: string) => void) | undefined;
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: routedHttp(ROUTES),
      config: hueConfig(),
      now: () => 0,
      sse: (opts) => {
        emit = opts.onMessage;
      },
    });
    await svc.onStart();
    // the stream is up before the first poll
    emit?.(JSON.stringify([{ type: "update", data: [] }]));
    await svc.getStats(new AbortController().signal);
    // CLIP v2 eventstream: a removed light arrives as a "delete" envelope
    emit?.(
      JSON.stringify([{ type: "delete", data: [{ id: "l1", type: "light" }] }])
    );
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.lightCount).toBe(1);
      expect(res.value.metrics.onCount).toBe(0);
      expect(res.value.metrics.offCount).toBe(1);
    }
    await svc.onStop();
  });

  it("an SSE update before the first poll does not replace the full light list", async () => {
    let emit: ((data: string) => void) | undefined;
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: routedHttp(ROUTES),
      config: hueConfig(),
      now: () => 0,
      sse: (opts) => {
        emit = opts.onMessage;
      },
    });
    await svc.onStart();
    // only l2 changed; l1 is unknown until the light list is fetched
    emit?.(
      JSON.stringify([
        {
          type: "update",
          data: [{ id: "l2", type: "light", on: { on: true } }],
        },
      ])
    );
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.lightCount).toBe(2);
    }
    await svc.onStop();
  });

  it("re-fetches the light list after an SSE error and drops vanished lights", async () => {
    let emit: ((data: string) => void) | undefined;
    let fail: ((e: unknown) => void) | undefined;
    const routes = { ...ROUTES };
    const http = routedHttp(routes);
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
      sse: (opts) => {
        emit = opts.onMessage;
        fail = opts.onError;
      },
    });
    await svc.onStart();
    await svc.getStats(new AbortController().signal);
    emit?.(JSON.stringify([{ type: "update", data: [] }]));
    // stream drops; meanwhile l1 is removed from the bridge
    fail?.(new Error("stream closed"));
    routes["/clip/v2/resource/light"] = {
      data: [{ id: "l2", type: "light", on: { on: false } }],
    };
    await svc.getStats(new AbortController().signal);
    // stream recovers with an unrelated event; counts come from the re-seeded map
    emit?.(JSON.stringify([{ type: "update", data: [] }]));
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.lightCount).toBe(1);
      expect(res.value.metrics.sseConnected).toBe(true);
    }
    await svc.onStop();
  });

  it("re-seeds after the stream recovers so a change made while it was down is not lost", async () => {
    let emit: ((data: string) => void) | undefined;
    let fail: ((e: unknown) => void) | undefined;
    const routes = { ...ROUTES };
    const http = routedHttp(routes);
    const lightFetches = () =>
      vi
        .mocked(http.send)
        .mock.calls.filter(
          ([req]) => new URL(req.url).pathname === "/clip/v2/resource/light"
        ).length;
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http,
      config: hueConfig(),
      now: () => 0,
      sse: (opts) => {
        emit = opts.onMessage;
        fail = opts.onError;
      },
    });
    await svc.onStart();
    emit?.(JSON.stringify([{ type: "update", data: [] }]));
    await svc.getStats(new AbortController().signal);

    fail?.(new Error("stream closed"));
    // fallback fetch while the stream is down
    await svc.getStats(new AbortController().signal);
    const afterFallback = lightFetches();
    // l2 is switched on before the stream reconnects: no event for it
    routes["/clip/v2/resource/light"] = {
      data: [
        { id: "l1", type: "light", on: { on: true } },
        { id: "l2", type: "light", on: { on: true } },
      ],
    };
    emit?.(JSON.stringify([{ type: "update", data: [] }]));

    const res = await svc.getStats(new AbortController().signal);
    expect(lightFetches()).toBe(afterFallback + 1);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.onCount).toBe(2);

    // seeded again while healthy: no further fetch
    await svc.getStats(new AbortController().signal);
    expect(lightFetches()).toBe(afterFallback + 1);
    await svc.onStop();
  });

  it("onStart skips SSE without an applicationKey and onStop aborts the stream", async () => {
    let started = 0;
    let abortSignal: AbortSignal | undefined;
    const noKey = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: routedHttp(ROUTES),
      config: makeConfig(),
      now: () => 0,
      sse: () => {
        started++;
      },
    });
    await noKey.onStart();
    expect(started).toBe(0);

    const withKey = new PhilipsBridgeService({
      ping: fakePing({ success: true }),
      http: routedHttp(ROUTES),
      config: hueConfig(),
      now: () => 0,
      sse: (opts) => {
        started++;
        abortSignal = opts.signal;
      },
    });
    await withKey.onStart();
    expect(started).toBe(1);
    expect(abortSignal?.aborted).toBe(false);
    await withKey.onStop();
    expect(abortSignal?.aborted).toBe(true);
  });
});

describe("PhilipsBridgeService rejected application key", () => {
  it("health reports the rejected key on the service tier", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: true, avgMs: 5 }),
      http: fakeHttp(403, { errors: [{ description: "unauthorized user" }] }),
      config: makeConfig({ applicationKey: "revoked" }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.service?.reachable).toBe(false);
      expect(res.value.service?.message).toBe(
        "application key rejected — re-pair the bridge"
      );
      expect(res.value.message).toBe(
        "application key rejected — re-pair the bridge"
      );
    }
  });

  it("an unreachable bridge is not reported as a rejected key", async () => {
    const svc = new PhilipsBridgeService({
      ping: fakePing({ success: false }),
      http: fakeHttp(503, {}),
      config: makeConfig({ applicationKey: "k" }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.service?.message ?? "").not.toMatch(/key rejected/);
      expect(res.value.message ?? "").not.toMatch(/key rejected/);
      // no certHash in this config: it reports the missing fingerprint instead
      expect(res.value.service?.message).toMatch(/certificate fingerprint/);
    }
  });

  it.each([401, 403])(
    "getStats returns UnauthorizedError on %i",
    async (status) => {
      const svc = new PhilipsBridgeService({
        ping: fakePing({ success: true }),
        http: fakeHttp(status, {}),
        config: makeConfig({ applicationKey: "revoked" }),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBeInstanceOf(UnauthorizedError);
        expect(res.error.message).toContain("re-pair the bridge");
      }
    }
  );
});
