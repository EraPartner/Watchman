import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { AdGuardService } from "./AdGuardService.js";
import { createHttpClient } from "../../../infra/http/client.js";
import type { AdGuardInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";

function fakePing(): PingProber {
  return { probe: () => Promise.resolve({ success: true, avgMs: 5 }) };
}

let server: Server;
let port: number;
let state: {
  running: boolean;
  protection: boolean;
  authRequired: boolean;
  lastAuth: string | undefined;
  failOptional: boolean;
  pathCounts: Record<string, number>;
};

function handler(req: IncomingMessage, res: ServerResponse) {
  if (state.authRequired) {
    state.lastAuth = req.headers["authorization"] as string | undefined;
    if (!state.lastAuth) {
      res.writeHead(401);
      res.end();
      return;
    }
  }
  const url = req.url ?? "";
  state.pathCounts[url] = (state.pathCounts[url] ?? 0) + 1;
  res.setHeader("content-type", "application/json");

  // Optional endpoints — return 500 when failOptional set
  const optionalPaths = [
    "/control/filtering/status",
    "/control/clients",
    "/control/dhcp/status",
    "/control/safebrowsing/status",
    "/control/parental/status",
    "/control/safesearch/status",
    "/control/dns_info",
  ];
  if (state.failOptional && optionalPaths.includes(url)) {
    res.writeHead(500);
    res.end(JSON.stringify({ message: "internal error" }));
    return;
  }

  if (url === "/control/status") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        running: state.running,
        version: "v0.107.50",
        protection_enabled: state.protection,
        dns_port: 53,
        http_port: 80,
      })
    );
  } else if (url === "/control/stats") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        num_dns_queries: 1000,
        num_blocked_filtering: 100,
        num_replaced_safebrowsing: 10,
        num_replaced_safesearch: 5,
        num_replaced_parental: 0,
        avg_processing_time: 0.0758,
        top_blocked_domains: [{ "ads.example.com": 50 }],
        top_queried_domains: [{ "good.example.com": 200 }],
        top_clients: [{ "192.168.1.10": 500 }],
        top_upstreams_responses: [
          { "https://dns.cloudflare.com/dns-query": 800 },
        ],
        top_upstreams_avg_time: [
          { "https://dns.cloudflare.com/dns-query": 0.0123 },
        ],
      })
    );
  } else if (url.startsWith("/control/querylog")) {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        data: [
          { client: "192.168.1.10", question: { name: "ads.example.com" }, reason: "FilteredBlackList", elapsedMs: "0.5" },
          { client: "192.168.1.10", question: { name: "ads.example.com" }, reason: "FilteredBlackList", elapsedMs: "1.5" },
          { client: "192.168.1.20", question: { name: "good.example.com" }, reason: "NotFilteredNotFound", elapsedMs: "4" },
          { client: "192.168.1.20", question: { name: "www.google.com" }, reason: "FilteredSafeSearch", elapsedMs: "2" },
        ],
      })
    );
  } else if (url === "/control/filtering/status") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        enabled: true,
        filters: [
          { rules_count: 1000, enabled: true },
          { rules_count: 500, enabled: false },
        ],
        user_rules: ["||custom.com^", "||another.com^"],
      })
    );
  } else if (url === "/control/clients") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        clients: [{ name: "desktop" }, { name: "phone" }],
        auto_clients: [{ name: "auto1" }, { name: "auto2" }, { name: "auto3" }],
      })
    );
  } else if (url === "/control/dhcp/status") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        enabled: true,
        leases: [{ ip: "192.168.1.100" }, { ip: "192.168.1.101" }],
        static_leases: [{ ip: "192.168.1.10" }],
      })
    );
  } else if (url === "/control/safebrowsing/status") {
    res.writeHead(200);
    res.end(JSON.stringify({ enabled: true }));
  } else if (url === "/control/parental/status") {
    res.writeHead(200);
    res.end(JSON.stringify({ enabled: false }));
  } else if (url === "/control/safesearch/status") {
    res.writeHead(200);
    res.end(JSON.stringify({ enabled: true }));
  } else if (url === "/control/dns_info") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        upstream_dns: ["https://dns.cloudflare.com/dns-query", "8.8.8.8"],
        upstream_mode: "parallel",
      })
    );
  } else {
    res.writeHead(404);
    res.end();
  }
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
    running: true,
    protection: true,
    authRequired: false,
    lastAuth: undefined,
    failOptional: false,
    pathCounts: {},
  };
});

function makeConfig(overrides: Partial<AdGuardInstance> = {}): AdGuardInstance {
  return {
    kind: "adguard",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    baseUrl: `http://127.0.0.1:${port}`,
    username: "",
    password: "",
    certSha256: "",
    readQueryLog: false,
    checkUpdates: false,
    ...overrides,
  };
}

describe("AdGuardService", () => {
  it("id is adguard:main", () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe("adguard:main");
  });

  it("checkHealth reports reachable when running", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.protectionEnabled).toBe(true);
    }
  });

  it("warns when protection disabled", async () => {
    state.protection = false;
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.warning).toMatch(/protection/i);
    }
  });

  it("not reachable when not running", async () => {
    state.running = false;
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it("sends basic auth when credentials provided", async () => {
    state.authRequired = true;
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ username: "admin", password: "pw" }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    const expected = "Basic " + Buffer.from("admin:pw").toString("base64");
    expect(state.lastAuth).toBe(expected);
  });

  it("missing or wrong credentials report UNAUTHORIZED, not UNAVAILABLE", async () => {
    state.authRequired = true;
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNAUTHORIZED");
  });

  it("getStats computes blocking rate", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 42,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        totalQueries: 1000,
        // 100 filtering + 10 safebrowsing + 0 parental; the 5 safe-search
        // rewrites are answered, not blocked
        blockedQueries: 110,
        allowedQueries: 890,
        blockingRate: 11,
        topBlockedDomain: "ads.example.com",
        topQueriedDomain: "good.example.com",
        topClient: "192.168.1.10",
      });
    }
  });

  it("getStats returns filtering and client metrics", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        filteringEnabled: true,
        filterCount: 2,
        totalRules: 1000, // disabled filter's 500 rules excluded
        userRules: 2,
        clientCount: 2,
        autoClientCount: 3,
      });
    }
  });

  it("getStats returns dhcp lease counts", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        dhcpEnabled: true,
        dhcpLeases: 2,
        dhcpStaticLeases: 1,
      });
    }
  });

  it("getStats returns security feature states and upstream info", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        safebrowsingEnabled: true,
        parentalEnabled: false,
        safesearchEnabled: true,
        upstreamCount: 2,
        upstreamMode: "parallel",
      });
    }
  });

  it("getStats succeeds when optional endpoints return 500", async () => {
    state.failOptional = true;
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    // Core stats should still succeed
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Core metrics intact
      expect(res.value.metrics.totalQueries).toBe(1000);
      expect(res.value.metrics.blockingRate).toBe(11);
      // Optional metrics fall back to null/0
      expect(res.value.metrics.filteringEnabled).toBeNull();
      expect(res.value.metrics.filterCount).toBe(0);
      expect(res.value.metrics.totalRules).toBe(0);
      expect(res.value.metrics.clientCount).toBe(0);
      expect(res.value.metrics.dhcpEnabled).toBeNull();
      expect(res.value.metrics.safebrowsingEnabled).toBeNull();
      expect(res.value.metrics.upstreamCount).toBe(0);
      expect(res.value.metrics.upstreamMode).toBeNull();
    }
  });

  it("getStats reports top upstream and its average response time", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.topUpstream).toBe(
        "https://dns.cloudflare.com/dns-query"
      );
      expect(res.value.metrics.topUpstreamAvgMs).toBe(12.3);
    }
  });

  it("getStats converts avg_processing_time from seconds to ms", async () => {
    // AdGuard Home reports avg_processing_time in seconds (e.g. 0.0758);
    // the metric and the "Avg proc (ms)" tile are in milliseconds
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.avgProcessingTime).toBe(75.8);
    }
  });

  it("config-grade endpoints ride the slow lane (memoized across polls)", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.getStats(new AbortController().signal);
    await svc.getStats(new AbortController().signal);
    expect(state.pathCounts["/control/stats"]).toBe(2);
    expect(state.pathCounts["/control/filtering/status"]).toBe(1);
    expect(state.pathCounts["/control/clients"]).toBe(1);
    expect(state.pathCounts["/control/dhcp/status"]).toBe(1);
    expect(state.pathCounts["/control/dns_info"]).toBe(1);
  });

  it("connection failure yields unreachable snapshot", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ baseUrl: "http://127.0.0.1:1" }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });
});

describe("AdGuardService query log (opt-in) and transport warning", () => {
  it("does not read the query log unless enabled", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    const asked = Object.keys(state.pathCounts).filter((p) => p.startsWith("/control/querylog"));
    expect(asked).toEqual([]);
    if (res.ok) expect(res.value.metrics).not.toHaveProperty("queryLogSampleSize");
  });

  it("summarises the latest query-log page when enabled", async () => {
    const svc = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ readQueryLog: true }),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(state.pathCounts["/control/querylog?limit=100"]).toBe(1);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        queryLogSampleSize: 4,
        // safe search is rewritten, not blocked
        queryLogBlocked: 2,
        queryLogAvgMs: 2,
        queryLogTopBlockedDomain: "ads.example.com",
        queryLogTopClient: "192.168.1.10",
      });
    }
  });

  it("flags credentials sent over plain http to another host, not to localhost", async () => {
    const local = new AdGuardService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ username: "u", password: "p" }),
      now: () => 0,
    });
    const res = await local.getStats(new AbortController().signal);
    if (res.ok) expect(res.value.metrics.cleartextCredentials).toBe(false);

    const remote = new AdGuardService({
      // answers every endpoint with an empty object
      http: {
        send: () => Promise.resolve({
          status: 200,
          headers: { "content-type": "application/json" },
          text: () => Promise.resolve("{}"),
          json: () => Promise.resolve(({}) as never),
        }),
      },
      ping: fakePing(),
      config: makeConfig({ baseUrl: "http://192.168.1.2", username: "u", password: "p" }),
      now: () => 0,
    });
    const remoteRes = await remote.getStats(new AbortController().signal);
    expect(remoteRes.ok).toBe(true);
    if (remoteRes.ok) expect(remoteRes.value.metrics.cleartextCredentials).toBe(true);
  });
});

/** Fake AdGuard that records every request and answers from a route table. */
function recordingHttp(
  routes: Record<string, { status: number; body: unknown }>,
  fallback: { status: number; body: unknown } = { status: 200, body: {} }
): {
  http: import("../../../infra/http/client.js").HttpClient;
  calls: Array<{ method: string; path: string; body: string | undefined }>;
} {
  const calls: Array<{ method: string; path: string; body: string | undefined }> = [];
  return {
    calls,
    http: {
      send: (req) => {
        const path = new URL(req.url).pathname + new URL(req.url).search;
        calls.push({
          method: req.method ?? "GET",
          path,
          body: typeof req.body === "string" ? req.body : undefined,
        });
        const route = routes[path] ?? fallback;
        return Promise.resolve({
          status: route.status,
          headers: { "content-type": "application/json" },
          text: () => Promise.resolve(JSON.stringify(route.body)),
          json: () => Promise.resolve(route.body as never),
        });
      },
    },
  };
}

describe("AdGuardService credentials, update check and freshness", () => {
  it("stops sending a refused password after the second rejection", async () => {
    let t = 0;
    // a wrong password is refused on every endpoint
    const rec = recordingHttp({}, { status: 401, body: {} });
    const svc = new AdGuardService({
      http: rec.http,
      ping: fakePing(),
      config: makeConfig({ username: "u", password: "wrong" }),
      now: () => t,
    });
    const first = await svc.getStats(new AbortController().signal);
    expect(!first.ok && first.error.code).toBe("UNAUTHORIZED");
    const afterFirst = rec.calls.length;

    // inside the 5-minute backoff: no request reaches AdGuard
    await svc.checkHealth(new AbortController().signal);
    await svc.getStats(new AbortController().signal);
    expect(rec.calls.length).toBe(afterFirst);

    // one retry after the backoff, rejected again: stop for good
    t += 5 * 60 * 1000;
    await svc.checkHealth(new AbortController().signal);
    const afterSecond = rec.calls.length;
    expect(afterSecond).toBeGreaterThan(afterFirst);
    t += 24 * 60 * 60 * 1000;
    const stopped = await svc.getStats(new AbortController().signal);
    const health = await svc.checkHealth(new AbortController().signal);
    expect(rec.calls.length).toBe(afterSecond);
    expect(!stopped.ok && stopped.error.message).toMatch(/save the credentials/);
    expect(health.ok && health.value.message).toMatch(/save the credentials/);
  });

  it("sends only GET requests unless the update check is turned on", async () => {
    const rec = recordingHttp({});
    const svc = new AdGuardService({
      http: rec.http,
      ping: fakePing(),
      config: makeConfig({ readQueryLog: true }),
      now: () => 0,
    });
    await svc.checkHealth(new AbortController().signal);
    await svc.getStats(new AbortController().signal);
    expect(rec.calls.length).toBeGreaterThan(5);
    expect(rec.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("opt-in update check is one POST with recheck_now false, every 6 hours", async () => {
    let t = 0;
    const rec = recordingHttp({
      "/control/status": { status: 200, body: { running: true, version: "v0.107.50" } },
      "/control/version.json": {
        status: 200,
        body: { new_version: "v0.107.52", can_autoupdate: true },
      },
    });
    const svc = new AdGuardService({
      http: rec.http,
      ping: fakePing(),
      config: makeConfig({ checkUpdates: true }),
      now: () => t,
    });
    const res = await svc.getStats(new AbortController().signal);
    t += 60 * 60 * 1000;
    await svc.getStats(new AbortController().signal);
    const posts = rec.calls.filter((c) => c.method !== "GET");
    expect(posts).toEqual([
      {
        method: "POST",
        path: "/control/version.json",
        body: JSON.stringify({ recheck_now: false }),
      },
    ]);
    expect(res.ok && res.value.metrics).toMatchObject({
      updateAvailable: true,
      latestVersion: "v0.107.52",
      updateCheckDisabled: false,
    });
  });

  it("reports filter lists that have not downloaded for over a week", async () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const rec = recordingHttp({
      "/control/filtering/status": {
        status: 200,
        body: {
          enabled: true,
          filters: [
            { name: "Fresh", enabled: true, rules_count: 1, last_updated: "2026-11-05T01:00:00Z" },
            { name: "Old", enabled: true, rules_count: 1, last_updated: "2026-10-01T00:00:00Z" },
            { name: "Never", enabled: true, rules_count: 0 },
            { name: "Disabled", enabled: false, last_updated: "2020-01-01T00:00:00Z" },
          ],
        },
      },
      "/control/tls/status": {
        status: 200,
        body: { enabled: true, not_after: "2027-01-01T00:00:00Z", valid_cert: true, valid_chain: true },
      },
    });
    const svc = new AdGuardService({
      http: rec.http,
      ping: fakePing(),
      config: makeConfig(),
      now: () => now,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok && res.value.metrics).toMatchObject({
      staleFilterCount: 2,
      staleFilters: ["Old", "Never"],
      oldestFilterUpdate: Date.parse("2026-10-01T00:00:00Z"),
      tlsEnabled: true,
      tlsCertNotAfter: Date.parse("2027-01-01T00:00:00Z"),
      tlsCertValid: true,
    });
  });
});
