import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { AlbyHubService } from "./AlbyHubService.js";
import { createHttpClient } from "../../../infra/http/client.js";
import type { AlbyHubInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type {
  HttpClient,
  HttpResponse,
} from "../../../infra/http/client.js";
import { TimeoutError } from "../../../core/errors.js";

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

let server: Server;
let port: number;
let state: {
  respondingPaths: Set<string>;
  infoPath: string | null;
  infoPayload: unknown;
  requireAuth: boolean;
  lastAuth: string | undefined;
  seenPaths: string[];
  // NWC mode: when true, /api/info and /api/apps are served as NWC endpoints.
  // Must be false for legacy probe tests — PROBE_PATHS includes /api/info, so an
  // unconditional handler would intercept legacy probes before /api/v1/info.
  nwcMode: boolean;
  failNwcInfo: boolean;
  failNwcApps: boolean;
};

// shapes follow getAlby/hub api/models.go (InfoResponse, ListAppsResponse,
// BalancesResponse, Channel)
const NWC_INFO_PAYLOAD = {
  nodeAlias: "Alby Hub NWC",
  version: "1.5.0",
  running: true,
  unlocked: false,
  network: "bitcoin",
  setupCompleted: true,
  backendType: "LDK",
};

const NWC_APPS_PAYLOAD = {
  apps: [
    { id: 1, name: "App1" },
    { id: 2, name: "App2" },
  ],
  totalCount: 2,
};

function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "";
  state.seenPaths.push(url);
  if (state.requireAuth) {
    state.lastAuth = req.headers["authorization"] as string | undefined;
  }

  // NWC-specific routes — only active when nwcMode is set, so legacy probe tests
  // are not affected by /api/info being in PROBE_PATHS.
  if (state.nwcMode) {
    if (url === "/api/info") {
      if (state.failNwcInfo) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(NWC_INFO_PAYLOAD));
      return;
    }
    if (url === "/api/apps") {
      if (!req.headers["authorization"]) {
        res.writeHead(401);
        res.end();
        return;
      }
      if (state.failNwcApps) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(NWC_APPS_PAYLOAD));
      return;
    }
    if (url === "/api/balances") {
      if (!req.headers["authorization"]) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          onchain: {
            spendable: 50_000,
            spendableSat: 50_000,
            total: 60_000,
            totalSat: 60_000,
          },
          lightning: {
            // deprecated unsuffixed fields deliberately disagree, so the
            // test proves the explicit *Msat fields win
            totalSpendable: 1,
            totalSpendableMsat: 2_000_000,
            totalReceivable: 1,
            totalReceivableMsat: 1_000_000,
          },
        })
      );
      return;
    }
    if (url === "/api/channels") {
      if (!req.headers["authorization"]) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify([
          {
            active: true,
            localBalanceMsat: 1_500_000,
            remoteBalanceMsat: 400_000,
          },
          {
            active: false,
            localBalanceMsat: 500_000,
            remoteBalanceMsat: 600_000,
          },
        ])
      );
      return;
    }
  }

  // Legacy probe / info routes
  if (state.infoPath && url === state.infoPath) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(state.infoPayload));
    return;
  }
  if (state.respondingPaths.has(url)) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
}

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer(handler);
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    })
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    })
);

beforeEach(() => {
  state = {
    respondingPaths: new Set(["/api/v1/info"]),
    infoPath: "/api/v1/info",
    infoPayload: {
      name: "Alby Hub",
      version: "1.2.3",
      description: "test hub",
    },
    requireAuth: false,
    lastAuth: undefined,
    seenPaths: [],
    nwcMode: false,
    failNwcInfo: false,
    failNwcApps: false,
  };
});

function makeConfig(overrides: Partial<AlbyHubInstance> = {}): AlbyHubInstance {
  return {
    kind: "albyHub",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    baseUrl: `http://127.0.0.1:${port}`,
    token: "",
    legacyProbe: true,
    ...overrides,
  };
}

describe("AlbyHubService", () => {
  // ── Legacy probe (legacyProbe: true) ──────────────────────────────────────

  it("id is albyHub:main", () => {
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe("albyHub:main");
  });

  it("checkHealth reports reachable with discovered endpoint", async () => {
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.endpoint).toBe("/api/v1/info");
    }
  });

  it("probe falls through to later path when earlier 404s", async () => {
    state.respondingPaths = new Set(["/health"]);
    state.infoPath = null;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.details?.endpoint).toBe("/health");
  });

  it("sends bearer token when configured", async () => {
    state.requireAuth = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ token: "tk_abc" }),
      now: () => 0,
    });
    await svc.checkHealth(new AbortController().signal);
    expect(state.lastAuth).toBe("Bearer tk_abc");
  });

  it("getStats extracts info fields and unwraps data envelope", async () => {
    state.infoPayload = {
      data: { name: "Hub X", version: "2.0.0", description: "wrapped" },
    };
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 42,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        name: "Hub X",
        version: "2.0.0",
        description: "wrapped",
        endpoint: "/api/v1/info",
        reachable: true,
      });
    }
  });

  it("getStats surfaces defaults when info unavailable", async () => {
    state.respondingPaths = new Set(["/"]);
    state.infoPath = null;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.name).toBe("Alby Hub");
      expect(res.value.metrics.reachable).toBe(false);
      expect(res.value.metrics.endpoint).toBe("/");
    }
  });

  it("connection failure yields unreachable snapshot", async () => {
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ baseUrl: "http://127.0.0.1:1" }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  // ── NWC deterministic path (legacyProbe: false) ───────────────────────────

  it("NWC checkHealth reports reachable with connected and version details", async () => {
    state.nwcMode = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false }),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.connected).toBe(true);
      expect(res.value.details?.running).toBe(true);
      expect(res.value.details?.version).toBe("1.5.0");
      expect(res.value.details?.endpoint).toBe("/api/info");
    }
  });

  it("NWC checkHealth reports unreachable when /api/info returns error", async () => {
    state.nwcMode = true;
    state.failNwcInfo = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false }),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it("NWC getStats returns full metrics including NWC-specific fields", async () => {
    state.nwcMode = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false, token: "nwc_tok" }),
      now: () => 10,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        name: "Alby Hub NWC",
        version: "1.5.0",
        reachable: true,
        // regression: these came from fields /api/info doesn't have
        // ("name", "connected") and an /api/apps shape it doesn't return
        // (bare array), so they were always the fallback / null
        connected: true,
        running: true,
        unlocked: false,
        network: "bitcoin",
        setupCompleted: true,
        backendType: "LDK",
        appCount: 2,
        endpoint: "/api/info",
      });
    }
  });

  it("NWC getStats returns null appCount when /api/apps fails", async () => {
    state.nwcMode = true;
    state.failNwcApps = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false, token: "nwc_tok" }),
      now: () => 5,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.reachable).toBe(true);
      expect(res.value.metrics.appCount).toBeNull();
    }
  });

  it("NWC getStats includes balances and channels when a token is configured", async () => {
    state.nwcMode = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false, token: "nwc_tok" }),
      now: () => 10,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        balanceLightningSpendableMsat: 2_000_000,
        balanceLightningReceivableMsat: 1_000_000,
        balanceOnchainSpendableSat: 50_000,
        balanceOnchainTotalSat: 60_000,
        channelCount: 2,
        channelsActive: 1,
        channelLocalBalanceMsat: 2_000_000,
        channelRemoteBalanceMsat: 1_000_000,
      });
    }
  });

  it("NWC getStats skips wallet endpoints without a token and nulls the metrics", async () => {
    state.nwcMode = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false }),
      now: () => 10,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.balanceLightningSpendableMsat).toBeNull();
      expect(res.value.metrics.channelCount).toBeNull();
    }
    expect(state.seenPaths).not.toContain("/api/balances");
    expect(state.seenPaths).not.toContain("/api/channels");
    // /api/apps is JWT-protected too, so it isn't requested without a token
    expect(state.seenPaths).not.toContain("/api/apps");
  });

  it("NWC checkHealth warns when the hub reports the node not running", async () => {
    state.nwcMode = true;
    const original = { ...NWC_INFO_PAYLOAD };
    Object.assign(NWC_INFO_PAYLOAD, { running: false });
    try {
      const svc = new AlbyHubService({
        http: createHttpClient(),
        ping: fakePing(),
        config: makeConfig({ legacyProbe: false }),
        now: () => 1,
      });
      const res = await svc.checkHealth(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.details?.running).toBe(false);
        expect(res.value.details?.warning).toMatch(/not running/);
      }
    } finally {
      Object.assign(NWC_INFO_PAYLOAD, original);
    }
  });

  it("NWC bearer token forwarded on deterministic paths", async () => {
    state.nwcMode = true;
    state.requireAuth = true;
    const svc = new AlbyHubService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false, token: "nwc_tok" }),
      now: () => 0,
    });
    await svc.checkHealth(new AbortController().signal);
    expect(state.lastAuth).toBe("Bearer nwc_tok");
  });

  // undici holds a socket until its body is read; every response must be consumed
  function trackingHttp(statusFor: (url: string) => number): {
    http: HttpClient;
    unread: () => string[];
  } {
    const responses: Array<{ url: string; read: boolean }> = [];
    const http: HttpClient = {
      send: async (req) => {
        const entry = { url: req.url, read: false };
        responses.push(entry);
        const status = statusFor(req.url);
        const body = status === 200 ? JSON.stringify(NWC_INFO_PAYLOAD) : "";
        const res: HttpResponse = {
          status,
          headers: {},
          text: async () => {
            entry.read = true;
            return body;
          },
          json: async <T>() => {
            entry.read = true;
            return JSON.parse(body) as T;
          },
        };
        return res;
      },
    };
    return {
      http,
      unread: () => responses.filter((r) => !r.read).map((r) => r.url),
    };
  }

  it("NWC getStats reads the bodies of 401 wallet responses", async () => {
    const { http, unread } = trackingHttp((url) =>
      url.endsWith("/api/info") ? 200 : 401
    );
    const svc = new AlbyHubService({
      http,
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false, token: "expired" }),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(unread()).toEqual([]);
  });

  it("legacy probe reads every response body", async () => {
    const { http, unread } = trackingHttp(() => 404);
    const svc = new AlbyHubService({
      http,
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.checkHealth(new AbortController().signal);
    await svc.getStats(new AbortController().signal);
    expect(unread()).toEqual([]);
  });

  it("NWC checkHealth keeps the timeout reason in its message", async () => {
    const http: HttpClient = {
      send: async () => {
        throw new TimeoutError("aborted after 2000ms");
      },
    };
    const svc = new AlbyHubService({
      http,
      ping: fakePing(),
      config: makeConfig({ legacyProbe: false }),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok && res.value.reachable).toBe(false);
    if (res.ok) expect(res.value.message).toContain("aborted after 2000ms");
  });
});
