import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { IpfsService } from "./IpfsService.js";
import { createHttpClient } from "../../../infra/http/client.js";
import type { IpfsInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";

function fakePing(): PingProber {
  return { probe: async () => ({ success: true, avgMs: 5 }) };
}

let server: Server;
let port: number;
let state: {
  failMode: "none" | "down";
  failOptional: boolean;
  methods: string[];
  pinLsCalls: number;
  dhtCalls: number;
  pinLsUrl: string;
};

const DHT_NDJSON = [
  JSON.stringify({ Name: "wan", Buckets: 20, PeerInfos: [{}, {}, {}] }),
  JSON.stringify({ Name: "lan", Buckets: 20, PeerInfos: [{}, {}] }),
].join("\n");

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        const url = req.url ?? "";
        state.methods.push(req.method ?? "");

        if (state.failMode === "down") {
          res.writeHead(500);
          res.end("boom");
          return;
        }

        const optionalPaths = [
          "/api/v0/diag/sys",
          "/api/v0/stats/dht",
          "/api/v0/pin/ls",
          "/api/v0/swarm/addrs/listen",
        ];
        if (
          state.failOptional &&
          optionalPaths.some((p) => url.startsWith(p))
        ) {
          res.writeHead(500);
          res.end("error");
          return;
        }

        res.setHeader("content-type", "application/json");
        if (url === "/api/v0/version") {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end();
            return;
          }
          res.writeHead(200);
          res.end(JSON.stringify({ Version: "0.28.0" }));
        } else if (url === "/api/v0/id") {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              ID: "QmTest",
              Addresses: ["/ip4/1.2.3.4/tcp/4001"],
            })
          );
        } else if (url.startsWith("/api/v0/swarm/peers")) {
          res.writeHead(200);
          res.end(JSON.stringify({ Peers: [{}, {}, {}] }));
        } else if (url.startsWith("/api/v0/repo/stat")) {
          res.writeHead(200);
          res.end(JSON.stringify({ RepoSize: 1234, NumObjects: 42 }));
        } else if (url.startsWith("/api/v0/stats/bw")) {
          res.writeHead(200);
          res.end(
            JSON.stringify({ TotalIn: 10, TotalOut: 20, RateIn: 1, RateOut: 2 })
          );
        } else if (url === "/api/v0/diag/sys") {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              MemoryAlloc: 52_428_800,
              GoNumGoroutine: 64,
              NumCPU: 4,
            })
          );
        } else if (url === "/api/v0/stats/dht") {
          state.dhtCalls++;
          // Returns NDJSON: one JSON object per line
          res.setHeader("content-type", "application/x-ndjson");
          res.writeHead(200);
          res.end(DHT_NDJSON);
        } else if (url === "/api/v0/stats/bitswap") {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              BlocksReceived: 120,
              BlocksSent: 80,
              DataReceived: 1_048_576,
              DataSent: 524_288,
              DupBlksReceived: 4,
              MessagesReceived: 300,
              Wantlist: [{}, {}],
            })
          );
        } else if (url.startsWith("/api/v0/pin/ls")) {
          state.pinLsCalls++;
          state.pinLsUrl = url;
          res.writeHead(200);
          res.end(
            JSON.stringify({
              Keys: {
                QmHash1: { Type: "recursive" },
                QmHash2: { Type: "recursive" },
                QmHash3: { Type: "recursive" },
              },
            })
          );
        } else if (url === "/api/v0/swarm/addrs/listen") {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              Strings: [
                "/ip4/0.0.0.0/tcp/4001",
                "/ip6/::/tcp/4001",
                "/ip4/0.0.0.0/udp/4001/quic-v1",
              ],
            })
          );
        } else {
          res.writeHead(404);
          res.end();
        }
      });
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
  state = { failMode: "none", failOptional: false, methods: [], pinLsCalls: 0, dhtCalls: 0, pinLsUrl: "" };
});

function makeConfig(overrides: Partial<IpfsInstance> = {}): IpfsInstance {
  return {
    kind: "ipfs",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    apiUrl: `http://127.0.0.1:${port}`,
    ...overrides,
  };
}

describe("IpfsService", () => {
  it("exposes kind:instanceId id", () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe("ipfs:main");
  });

  it("checkHealth returns reachable on 200", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.version).toBe("0.28.0");
    }
  });

  it("checkHealth returns unreachable on 500", async () => {
    state.failMode = "down";
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });

  it("getStats aggregates core endpoints", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 5,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        version: "0.28.0",
        nodeId: "QmTest",
        addressCount: 1,
        peers: 3,
        repoSize: 1234,
        numObjects: 42,
        bwTotalIn: 10,
        bwRateOut: 2,
      });
    }
  });

  it("getStats returns diag/sys metrics", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      // 50 MB = 52_428_800 bytes
      expect(res.value.metrics.memAllocMb).toBe(50);
      expect(res.value.metrics.goroutines).toBe(64);
      expect(res.value.metrics.numCPU).toBe(4);
    }
  });

  it("getStats sums DHT peers across routing tables", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      // wan: 3 peers + lan: 2 peers = 5 total
      expect(res.value.metrics.dhtPeers).toBe(5);
    }
  });

  it("getStats counts pinned CIDs", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.pinnedCount).toBe(3);
    }
  });

  it("getStats counts listen addresses", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.listenAddrCount).toBe(3);
    }
  });

  it("getStats succeeds when optional endpoints return 500", async () => {
    state.failOptional = true;
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    // Core stats still succeed
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics.version).toBe("0.28.0");
      // Optional metrics fall back to null/0
      expect(res.value.metrics.memAllocMb).toBeNull();
      expect(res.value.metrics.goroutines).toBeNull();
      expect(res.value.metrics.dhtPeers).toBe(0);
      expect(res.value.metrics.pinnedCount).toBeNull();
      expect(res.value.metrics.listenAddrCount).toBeNull();
    }
  });

  it("issues only POST requests (Kubo RPC is POST-only)", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    expect(state.methods.every((m) => m === "POST")).toBe(true);
    expect(state.methods.length).toBeGreaterThan(0);
  });

  it("getStats exposes bitswap exchange metrics", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        bitswapBlocksReceived: 120,
        bitswapBlocksSent: 80,
        bitswapDataReceived: 1_048_576,
        bitswapDataSent: 524_288,
        bitswapDupBlocks: 4,
        bitswapWantlistCount: 2,
      });
    }
  });

  it("pin/ls and stats/dht ride the slow lane (memoized across polls)", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.getStats(new AbortController().signal);
    await svc.getStats(new AbortController().signal);
    expect(state.pinLsCalls).toBe(1);
    expect(state.dhtCalls).toBe(1);
  });

  it("pin/ls requests the quiet listing", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig(),
      now: () => 1,
    });
    await svc.getStats(new AbortController().signal);
    expect(state.pinLsUrl).toContain("quiet=true");
  });

  it("connection failure yields unreachable snapshot", async () => {
    const svc = new IpfsService({
      http: createHttpClient(),
      ping: fakePing(),
      config: makeConfig({ apiUrl: "http://127.0.0.1:1" }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.reachable).toBe(false);
  });
});
