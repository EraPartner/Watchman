import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { QBittorrentService } from "./QBittorrentService.js";
import {
  createHttpClient,
  type HttpClient,
  type HttpResponse,
} from "../../../infra/http/client.js";
import type { QbittorrentInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

let server: Server;
let port: number;
let state: {
  loginStatus: number;
  // qBittorrent answers wrong credentials with 200 "Fails." and no cookie
  loginRejects: boolean;
  cookie: string;
  expireNextRequest: boolean;
  loginCalls: number;
  lastRid: number;
  torrentsInfoCalls: number;
  transferInfoCalls: number;
  versionCalls: number;
  preferencesCalls: number;
  lastLogQuery: string;
  extraLogEntries: Array<{
    id: number;
    message: string;
    timestamp: number;
    type: number;
  }>;
};

const TORRENT_LIST = [
  {
    hash: "abc",
    name: "movie.mkv",
    state: "downloading",
    progress: 0.5,
    dlspeed: 1000,
    upspeed: 100,
    size: 1_000_000_000,
    downloaded: 500_000_000,
    uploaded: 50_000_000,
    eta: 500,
    category: "movies",
    magnet_uri: "magnet:?xt=urn:btih:abc",
    save_path: "/data/private/movies",
  },
  {
    hash: "def",
    name: "album.zip",
    state: "uploading",
    progress: 1.0,
    dlspeed: 0,
    upspeed: 500,
    size: 100_000_000,
    downloaded: 100_000_000,
    uploaded: 200_000_000,
    eta: -1,
    category: "",
  },
];

const LOG_ENTRIES = [
  { id: 1, message: "Disk write error", timestamp: 1_700_000_000, type: 8 },
  { id: 2, message: "Tracker warning", timestamp: 1_700_000_001, type: 4 },
];

function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url ?? "/";
  const parsed = new URL(rawUrl, "http://localhost");
  const pathname = parsed.pathname;

  if (pathname === "/api/v2/auth/login") {
    state.loginCalls++;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (state.loginStatus !== 200) {
        res.writeHead(state.loginStatus);
        res.end();
        return;
      }
      if (state.loginRejects) {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("Fails.");
        return;
      }
      res.setHeader("set-cookie", `SID=${state.cookie}; path=/`);
      res.writeHead(200);
      res.end("Ok.");
    });
    return;
  }

  const cookie = req.headers["cookie"] ?? "";
  if (!cookie.includes(`SID=${state.cookie}`) || state.expireNextRequest) {
    state.expireNextRequest = false;
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (pathname === "/api/v2/app/version") {
    state.versionCalls++;
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("v4.6.0");
  } else if (pathname === "/api/v2/app/preferences") {
    state.preferencesCalls++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ listen_port: 6881 }));
  } else if (pathname === "/api/v2/sync/maindata") {
    state.lastRid = parseInt(parsed.searchParams.get("rid") ?? "0", 10);
    const isFirst = state.lastRid === 0;
    const responseRid = state.lastRid + 1;
    const body = isFirst
      ? {
          rid: responseRid,
          full_update: true,
          server_state: {
            connection_status: "connected",
            dht_nodes: 50,
            free_space_on_disk: 999,
            dl_info_speed: 100,
            up_info_speed: 50,
            dl_info_data: 1000,
            up_info_data: 500,
            alltime_dl: 5000,
            alltime_ul: 9000,
            global_ratio: "1.80",
          },
          torrents: {
            abc: { ...TORRENT_LIST[0] },
            def: { ...TORRENT_LIST[1] },
            c: { state: "pausedDL" },
            d: { state: "stalledUP" },
          },
        }
      : {
          rid: responseRid,
          full_update: false,
          server_state: { dht_nodes: 75 },
        };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  } else if (pathname === "/api/v2/transfer/info") {
    state.transferInfoCalls++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        dl_info_speed: 100,
        up_info_speed: 50,
        dl_info_data: 1000,
        up_info_data: 500,
      })
    );
  } else if (pathname === "/api/v2/torrents/info") {
    state.torrentsInfoCalls++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(TORRENT_LIST));
  } else if (pathname === "/api/v2/log/main") {
    const lastKnownId = parseInt(
      parsed.searchParams.get("last_known_id") ?? "-1",
      10
    );
    state.lastLogQuery = parsed.search.replace(/^\?/, "");
    const filtered = [...LOG_ENTRIES, ...state.extraLogEntries].filter(
      (e) => e.id > lastKnownId
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(filtered));
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
    loginStatus: 200,
    loginRejects: false,
    cookie: "abc123",
    expireNextRequest: false,
    loginCalls: 0,
    lastRid: 0,
    torrentsInfoCalls: 0,
    transferInfoCalls: 0,
    versionCalls: 0,
    preferencesCalls: 0,
    lastLogQuery: "",
    extraLogEntries: [],
  };
});

function makeConfig(
  overrides: Partial<QbittorrentInstance> = {}
): QbittorrentInstance {
  return {
    kind: "qbittorrent",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    baseUrl: `http://127.0.0.1:${port}`,
    username: "admin",
    password: "secret",
    ...overrides,
  };
}

describe("QBittorrentService", () => {
  it("id is qbittorrent:main", () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe("qbittorrent:main");
  });

  it("checkHealth authenticates and reports reachable", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(state.loginCalls).toBe(1);
  });

  it("reuses cookie across calls", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.checkHealth(new AbortController().signal);
    await svc.checkHealth(new AbortController().signal);
    expect(state.loginCalls).toBe(1);
  });

  it("re-auths after 403", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.checkHealth(new AbortController().signal);
    state.expireNextRequest = true;
    state.cookie = "new456";
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(state.loginCalls).toBe(2);
  });

  it("bad credentials yields unreachable snapshot", async () => {
    state.loginStatus = 403;
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it("getStats aggregates endpoints and counts torrents", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 42,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        version: "v4.6.0",
        torrentsTotal: 4,
        torrentsDownloading: 1,
        torrentsSeeding: 2,
        torrentsPaused: 1,
        torrentsCompleted: 2,
        torrentsError: 0,
        dlSpeed: 100,
        upSpeed: 50,
        // all-time totals preferred over session dl_info_data/up_info_data
        dlData: 5000,
        upData: 9000,
        ratio: "1.80",
        connectionStatus: "connected",
        listenPort: 6881,
        dhtNodes: 50,
        freeSpaceOnDisk: 999,
      });
    }
    // transfer data comes from maindata's server_state, not /transfer/info
    expect(state.transferInfoCalls).toBe(0);
  });

  it("version and preferences are memoized across polls", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.getStats(new AbortController().signal);
    await svc.getStats(new AbortController().signal);
    expect(state.versionCalls).toBe(1);
    expect(state.preferencesCalls).toBe(1);
  });

  it("activeTorrents sorted by combined speed", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    // active set is derived from the synced maindata cache, not /torrents/info
    expect(state.torrentsInfoCalls).toBe(0);
    if (res.ok) {
      const active = res.value.metrics.activeTorrents as Array<{
        name?: string;
      }>;
      expect(Array.isArray(active)).toBe(true);
      expect(active).toHaveLength(2);
      // movie.mkv: dl=1000 + ul=100 = 1100 > album.zip: dl=0 + ul=500 = 500
      expect(active[0]?.name).toBe("movie.mkv");
      expect(active[1]?.name).toBe("album.zip");
    }
  });

  it("activeTorrents keep only the documented fields", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const active = res.value.metrics.activeTorrents as Array<
        Record<string, unknown>
      >;
      expect(Object.keys(active[0] ?? {}).sort()).toEqual(
        [
          "hash",
          "name",
          "state",
          "progress",
          "dlspeed",
          "upspeed",
          "size",
          "downloaded",
          "uploaded",
          "eta",
          "category",
        ].sort()
      );
      expect(active[0]).not.toHaveProperty("magnet_uri");
    }
  });

  it("parallel requests on a cold start share one login", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const [stats, health] = await Promise.all([
      svc.getStats(new AbortController().signal),
      svc.checkHealth(new AbortController().signal),
    ]);
    expect(stats.ok).toBe(true);
    expect(health.ok && health.value.reachable).toBe(true);
    expect(state.loginCalls).toBe(1);
  });

  it("a rejected login is not retried until the backoff passes", async () => {
    state.loginStatus = 403;
    let t = 1;
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => t,
    });
    const first = await svc.getStats(new AbortController().signal);
    const second = await svc.getStats(new AbortController().signal);
    const health = await svc.checkHealth(new AbortController().signal);
    expect(state.loginCalls).toBe(1);
    expect(!first.ok && first.error.code).toBe("UNAUTHORIZED");
    expect(!second.ok && second.error.code).toBe("UNAUTHORIZED");
    expect(health.ok && health.value.reachable).toBe(false);

    t += 5 * 60 * 1000;
    state.loginStatus = 200;
    const recovered = await svc.getStats(new AbortController().signal);
    expect(recovered.ok).toBe(true);
    expect(state.loginCalls).toBe(2);
  });

  it("wrong credentials report a clear message", async () => {
    state.loginRejects = true;
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(!res.ok && res.error.message).toContain(
      "rejected the username or password"
    );
  });

  it("recentErrors and recentWarnings extracted from log entries", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const { recentErrors, recentWarnings } = res.value.metrics as {
        recentErrors: string[];
        recentWarnings: string[];
      };
      expect(recentErrors).toContain("Disk write error");
      expect(recentWarnings).toContain("Tracker warning");
    }
  });

  it("rid=0 on first getStats, increments to server-returned rid on second", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.getStats(new AbortController().signal);
    expect(state.lastRid).toBe(0); // first call sent rid=0

    await svc.getStats(new AbortController().signal);
    expect(state.lastRid).toBe(1); // second call sent rid=1 (from server's previous response)
  });

  it("delta maindata merges into cached server state", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });

    // First call: full_update with dht_nodes=50
    const res1 = await svc.getStats(new AbortController().signal);
    expect(res1.ok).toBe(true);
    if (res1.ok) expect(res1.value.metrics.dhtNodes).toBe(50);

    // Second call: delta with dht_nodes=75; connection_status/ratio preserved from cache
    const res2 = await svc.getStats(new AbortController().signal);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.value.metrics.dhtNodes).toBe(75);
      expect(res2.value.metrics.connectionStatus).toBe("connected");
      expect(res2.value.metrics.ratio).toBe("1.80");
    }
  });

  it("log entries only fetched after last known id, recent list persists", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });

    // First call: last_known_id=-1 → gets both entries
    const res1 = await svc.getStats(new AbortController().signal);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      const { recentErrors, recentWarnings } = res1.value.metrics as {
        recentErrors: string[];
        recentWarnings: string[];
      };
      expect(recentErrors).toHaveLength(1);
      expect(recentWarnings).toHaveLength(1);
    }

    // Second call: last_known_id=2 → no new entries, but the recent
    // warnings/errors stay visible instead of vanishing after one poll
    const res2 = await svc.getStats(new AbortController().signal);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      const { recentErrors, recentWarnings } = res2.value.metrics as {
        recentErrors: string[];
        recentWarnings: string[];
      };
      expect(recentErrors).toEqual(["Disk write error"]);
      expect(recentWarnings).toEqual(["Tracker warning"]);
    }
    expect(state.lastLogQuery).toContain("last_known_id=2");
  });

  it("log/main requests only warning and critical entries", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.getStats(new AbortController().signal);
    // qBittorrent's log/main filters with normal/info/warning/critical
    // booleans; there is no `type` parameter
    const q = new URLSearchParams(state.lastLogQuery);
    expect(q.get("normal")).toBe("false");
    expect(q.get("info")).toBe("false");
    expect(q.get("warning")).toBe("true");
    expect(q.get("critical")).toBe("true");
    expect(q.has("type")).toBe(false);
  });

  it("recent errors are newest first and capped", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    state.extraLogEntries = Array.from({ length: 25 }, (_, i) => ({
      id: 10 + i,
      message: `err ${i}`,
      timestamp: 1_700_000_010 + i,
      type: 8,
    }));
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const { recentErrors } = res.value.metrics as { recentErrors: string[] };
      expect(recentErrors).toHaveLength(20);
      expect(recentErrors[0]).toBe("err 24");
    }
  });

  it("overlapping getStats runs do not list a log entry twice", async () => {
    const svc = new QBittorrentService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    // both runs fetch the log with the same cursor and get the same entries
    const [a, b] = await Promise.all([
      svc.getStats(new AbortController().signal),
      svc.getStats(new AbortController().signal),
    ]);
    for (const res of [a, b]) {
      expect(res.ok).toBe(true);
      if (res.ok) {
        const { recentErrors, recentWarnings } = res.value.metrics as {
          recentErrors: string[];
          recentWarnings: string[];
        };
        expect(recentWarnings).toEqual(["Tracker warning"]);
        expect(recentErrors).toEqual(["Disk write error"]);
      }
    }
    const next = await svc.getStats(new AbortController().signal);
    if (next.ok) {
      const { recentWarnings } = next.value.metrics as {
        recentWarnings: string[];
      };
      expect(recentWarnings).toHaveLength(1);
    }
  });

  it("parallel 403s share one re-login and keep the fresh cookie", async () => {
    let sid = "old";
    let logins = 0;
    let stale = 0;
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((r) => (releaseFirst = r));
    const secondGate = new Promise<void>((r) => (releaseSecond = r));
    const respond = (
      status: number,
      body = "",
      headers: HttpResponse["headers"] = {}
    ): HttpResponse => ({
      status,
      headers,
      text: async () => body,
      json: async <T>() => JSON.parse(body) as T,
    });
    const http: HttpClient = {
      send: async (req) => {
        if (req.url.endsWith("/api/v2/auth/login")) {
          logins++;
          return respond(200, "Ok.", { "set-cookie": `SID=${sid}; path=/` });
        }
        const cookie = req.headers?.["cookie"];
        if (cookie === `SID=${sid}`) {
          // the first request retried with the new cookie: only now does
          // the second request's 403 (sent with the old cookie) arrive
          if (sid === "new") releaseSecond();
          return respond(200, "v4.6.0");
        }
        stale++;
        if (stale === 1) {
          await firstGate;
        } else {
          releaseFirst();
          await secondGate;
        }
        return respond(403, "Forbidden");
      },
    };
    const svc = new QBittorrentService({
      http,
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.checkHealth(new AbortController().signal);
    expect(logins).toBe(1);

    // the session expires server-side; both in-flight requests get 403
    sid = "new";
    const [a, b] = await Promise.all([
      svc.checkHealth(new AbortController().signal),
      svc.checkHealth(new AbortController().signal),
    ]);
    expect(a.ok && a.value.reachable).toBe(true);
    expect(b.ok && b.value.reachable).toBe(true);
    expect(stale).toBe(2);
    expect(logins).toBe(2);
  });

  it("connection failure yields unreachable snapshot", async () => {
    const svc = new QBittorrentService({
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
