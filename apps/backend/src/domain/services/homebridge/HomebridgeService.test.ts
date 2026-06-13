import { describe, it, expect } from "vitest";
import { HomebridgeService } from "./HomebridgeService.js";
import type { HomebridgeClient } from "./homebridgeClient.js";
import type { HomebridgeInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import { UnauthorizedError, UnavailableError } from "../../../core/errors.js";

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

const cfg: HomebridgeInstance = {
  kind: "homebridge",
  instanceId: "main",
  enabled: true,
  pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
  cacheTtlMs: 10_000,
  timeoutMs: 5_000,
  baseUrl: "http://hb.local",
  username: "",
  password: "",
  authToken: "T",
  statusPath: "/api/status/server-information",
  versionPath: "/api/status/homebridge-version",
  loginPath: "/api/auth/login",
  allowSelfSigned: false,
};

function fakeClient(handler: (path: string) => unknown): HomebridgeClient {
  return {
    async get<T>(path: string) {
      const v = handler(path);
      if (v instanceof Error) throw v;
      return v as T;
    },
  };
}

describe("HomebridgeService", () => {
  const now = () => 1_000;

  it("id composes kind and instance", () => {
    const svc = new HomebridgeService({
      client: fakeClient(() => ({})),
      ping: fakePing(),
      config: cfg,
      now,
    });
    expect(svc.id).toBe("homebridge:main");
  });

  it("checkHealth ok with hostname and version details", async () => {
    const svc = new HomebridgeService({
      client: fakeClient((p) => {
        if (p === cfg.statusPath)
          return { hostname: "pi", homebridgeVersion: "1.8.0" };
        if (p === cfg.versionPath) return { installedVersion: "1.8.0" };
        return null;
      }),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.checkHealth(new AbortController().signal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reachable).toBe(true);
      expect(r.value.details?.["hostname"]).toBe("pi");
      expect(r.value.details?.["currentVersion"]).toBe("1.8.0");
    }
  });

  it("checkHealth swallows version failure, still ok on status", async () => {
    const svc = new HomebridgeService({
      client: fakeClient((p) => {
        if (p === cfg.statusPath) return { hostname: "pi" };
        return new Error("version endpoint down");
      }),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.checkHealth(new AbortController().signal);
    expect(r.ok).toBe(true);
  });

  it("checkHealth err on status failure yields unreachable snapshot", async () => {
    const svc = new HomebridgeService({
      client: fakeClient(() => new UnauthorizedError("nope")),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.checkHealth(new AbortController().signal);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reachable).toBe(false);
  });

  it("checkHealth wraps non-domain error as unreachable snapshot", async () => {
    const svc = new HomebridgeService({
      client: fakeClient(() => new Error("ECONNREFUSED")),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.checkHealth(new AbortController().signal);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reachable).toBe(false);
  });

  it("getStats returns primitive metrics", async () => {
    const svc = new HomebridgeService({
      client: fakeClient((p) => {
        if (p === cfg.statusPath)
          return {
            hostname: "pi",
            platform: "linux",
            homebridgeVersion: "1.8.0",
            serverVersion: "4.56",
            uptime: 42,
          };
        if (p === cfg.versionPath) return "v1.8.0";
        return null;
      }),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.getStats(new AbortController().signal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.metrics["hostname"]).toBe("pi");
      expect(r.value.metrics["uptime"]).toBe(42);
      expect(r.value.metrics["currentVersion"]).toBe("v1.8.0");
    }
  });

  it("getStats defaults when status fields missing", async () => {
    const svc = new HomebridgeService({
      client: fakeClient(() => ({})),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.getStats(new AbortController().signal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.metrics["hostname"]).toBe("");
      expect(r.value.metrics["uptime"]).toBe(0);
      expect(r.value.metrics["currentVersion"]).toBe("unknown");
    }
  });

  it("getStats surfaces extended status API telemetry", async () => {
    const svc = new HomebridgeService({
      client: fakeClient((p) => {
        if (p === cfg.statusPath) return { hostname: "pi", uptime: 42 };
        if (p === cfg.versionPath)
          return {
            installedVersion: "1.8.0",
            latestVersion: "1.9.0",
            updateAvailable: true,
          };
        if (p === "/api/status/cpu")
          // Config UI X shape: currentLoad is systeminformation's object, not a bare number
          return {
            currentLoad: { currentLoad: 12.345 },
            cpuTemperature: { main: 51 },
          };
        if (p === "/api/status/ram")
          return { mem: { total: 8_000_000, active: 3_000_000 } };
        if (p === "/api/status/uptime")
          return { time: { uptime: 99_000 }, processUptime: 1_234 };
        if (p === "/api/status/homebridge") return { status: "up" };
        if (p === "/api/status/homebridge/child-bridges")
          return [
            { name: "hue", status: "ok" },
            { name: "cam", status: "down" },
          ];
        if (p === "/api/plugins")
          return [{ updateAvailable: true }, { updateAvailable: false }];
        if (p === "/api/accessories") return [{}, {}, {}];
        return null;
      }),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.getStats(new AbortController().signal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.metrics).toMatchObject({
        currentVersion: "1.8.0",
        latestVersion: "1.9.0",
        updateAvailable: true,
        status: "up",
        cpuLoad: 12.35,
        cpuTemp: 51,
        memTotalBytes: 8_000_000,
        memUsedBytes: 3_000_000,
        hostUptime: 99_000,
        processUptime: 1_234,
        childBridgeCount: 2,
        childBridgesUp: 1,
        pluginCount: 2,
        pluginUpdatesAvailable: 1,
        accessoryCount: 3,
      });
    }
  });

  it("getStats nulls extended metrics when endpoints are unavailable", async () => {
    const svc = new HomebridgeService({
      client: fakeClient((p) => {
        if (p === cfg.statusPath) return { hostname: "pi" };
        return new Error("not available");
      }),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.getStats(new AbortController().signal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.metrics.status).toBeNull();
      expect(r.value.metrics.cpuLoad).toBeNull();
      expect(r.value.metrics.childBridgeCount).toBeNull();
      expect(r.value.metrics.pluginCount).toBeNull();
      expect(r.value.metrics.accessoryCount).toBeNull();
      expect(r.value.metrics.updateAvailable).toBeNull();
    }
  });

  it("version and plugins ride the slow lane (memoized across polls)", async () => {
    const calls: Record<string, number> = {};
    const svc = new HomebridgeService({
      client: fakeClient((p) => {
        calls[p] = (calls[p] ?? 0) + 1;
        if (p === cfg.statusPath) return { hostname: "pi" };
        if (p === cfg.versionPath) return { installedVersion: "1.8.0" };
        if (p === "/api/plugins") return [];
        return null;
      }),
      ping: fakePing(),
      config: cfg,
      now,
    });
    await svc.getStats(new AbortController().signal);
    await svc.getStats(new AbortController().signal);
    expect(calls[cfg.versionPath]).toBe(1);
    expect(calls["/api/plugins"]).toBe(1);
    expect(calls[cfg.statusPath]).toBe(2);
  });

  it("getStats err with domain error passthrough", async () => {
    const svc = new HomebridgeService({
      client: fakeClient(() => new UnavailableError("down")),
      ping: fakePing(),
      config: cfg,
      now,
    });
    const r = await svc.getStats(new AbortController().signal);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(UnavailableError);
  });
});
