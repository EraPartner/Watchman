import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { TorService } from "./TorService.js";
import { createHttpClient } from "../../../infra/http/client.js";
import { NotFoundError, UnavailableError } from "../../../core/errors.js";
import type { TorInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type { TorControlClient } from "../../../infra/tor/controlClient.js";
import type {
  TorEventSubscription,
  TorEventSubscriptionFactory,
  TorEventHandler,
} from "../../../infra/tor/eventSubscription.js";

let server: Server;
let port: number;
let state: { status: number; payload: unknown; lastSearch: string | null };

function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/details") {
    state.lastSearch = url.searchParams.get("search");
    res.writeHead(state.status, { "content-type": "application/json" });
    res.end(JSON.stringify(state.payload));
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
    status: 200,
    payload: {
      relays: [
        {
          nickname: "MyRelay",
          fingerprint: "ABCD1234EFGH5678IJKL",
          running: true,
          hibernating: false,
          flags: ["Guard", "Fast", "Running"],
          country: "us",
          country_name: "United States",
          city_name: "Seattle",
          first_seen: "2020-01-01",
          last_seen: "2026-04-18",
          consensus_weight: 1234,
          platform: "Tor 0.4.8.10 on Linux",
          contact: "op@example.com",
          or_addresses: ["10.0.0.1:9001"],
          version: "0.4.8.10",
          observed_bandwidth: 5000,
          bandwidth_burst: 8000,
        },
      ],
    },
    lastSearch: null,
  };
});

function makeConfig(overrides: Partial<TorInstance> = {}): TorInstance {
  return {
    kind: "tor",
    instanceId: "main",
    enabled: true,
    pollPolicy: { healthMs: 10_000, statsMs: 30_000, jitterRatio: 0.1 },
    cacheTtlMs: 10_000,
    timeoutMs: 2_000,
    relayNickname: "MyRelay",
    onionooBaseUrl: `http://127.0.0.1:${port}`,
    host: "127.0.0.1",
    pingCount: 1,
    controlPort: 9051,
    controlPassword: "",
    cookieAuthFile: "",
    useControlPort: false,
    ...overrides,
  };
}

function fakePing(success = true, avgMs = 5): PingProber {
  return {
    probe: async () =>
      success ? { success: true, avgMs } : { success: false },
  };
}

function fakeTorControl(
  info: Map<string, string> = new Map()
): TorControlClient {
  return {
    connect: async () => ({
      getinfo: async () => info,
      getconf: async () => new Map(),
      signal: async () => undefined,
      close: async () => undefined,
    }),
  };
}

interface FakeTorEventSub extends TorEventSubscription {
  lastSetevents: string[];
  wasClosed: boolean;
  fire(event: string, args: string[]): void;
}

function makeFakeSub(): FakeTorEventSub {
  const handlers = new Map<string, TorEventHandler[]>();
  const sub: FakeTorEventSub = {
    lastSetevents: [],
    wasClosed: false,
    fire(event: string, args: string[]): void {
      for (const h of handlers.get(event) ?? []) h(event, args);
    },
    async setevents(events: string[], _signal: AbortSignal): Promise<void> {
      sub.lastSetevents = events;
    },
    on(event: string, handler: TorEventHandler): void {
      const existing = handlers.get(event);
      if (existing) existing.push(handler);
      else handlers.set(event, [handler]);
    },
    async close(): Promise<void> {
      sub.wasClosed = true;
    },
  };
  return sub;
}

function makeFakeSubFactory(sub: FakeTorEventSub): TorEventSubscriptionFactory {
  return { create: async () => sub };
}

function failingTorControl(
  e: Error = new UnavailableError("connection refused")
): TorControlClient {
  return {
    connect: async () => {
      throw e;
    },
  };
}

/**
 * Returns a TorControlClient that iterates through a sequence of info maps,
 * one per getinfo call (cycling back after exhausted).
 */
function sequenceTorControl(infos: Map<string, string>[]): TorControlClient {
  let idx = 0;
  return {
    connect: async () => ({
      getinfo: async () => infos[idx++ % infos.length] ?? new Map(),
      getconf: async () => new Map(),
      signal: async () => undefined,
      close: async () => undefined,
    }),
  };
}

describe("TorService", () => {
  it("id is tor:main", () => {
    const svc = new TorService({
      http: createHttpClient(),
      ping: fakePing(),
      torControl: fakeTorControl(),
      config: makeConfig(),
      now: () => 0,
    });
    expect(svc.id).toBe("tor:main");
  });

  it("checkHealth reports reachable when relay is running", async () => {
    const svc = new TorService({
      http: createHttpClient(),
      ping: fakePing(),
      torControl: fakeTorControl(),
      config: makeConfig(),
      now: () => 1,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(true);
      expect(res.value.details?.version).toBe("0.4.8.10");
    }
    expect(state.lastSearch).toBe("MyRelay");
  });

  it("returns NotFoundError when relay missing", async () => {
    state.payload = { relays: [] };
    const svc = new TorService({
      http: createHttpClient(),
      ping: fakePing(),
      torControl: fakeTorControl(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(NotFoundError);
  });

  it("warns and marks unreachable when hibernating", async () => {
    state.payload = {
      relays: [
        {
          ...((state.payload as { relays: unknown[] }).relays[0] as object),
          hibernating: true,
        },
      ],
    };
    const svc = new TorService({
      http: createHttpClient(),
      ping: fakePing(),
      torControl: fakeTorControl(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reachable).toBe(false);
      expect(res.value.details?.warning).toMatch(/hibernat/i);
    }
  });

  it("getStats exposes relay metrics", async () => {
    const svc = new TorService({
      http: createHttpClient(),
      ping: fakePing(),
      torControl: fakeTorControl(),
      config: makeConfig(),
      now: () => 42,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.metrics).toMatchObject({
        nickname: "MyRelay",
        running: true,
        relayType: "guard",
        orPort: 9001,
        country: "United States",
        consensusWeight: 1234,
      });
    }
  });

  it("picks exact-match nickname over first result", async () => {
    state.payload = {
      relays: [
        { nickname: "MyRelayAlt", fingerprint: "ZZZ", running: true },
        { nickname: "MyRelay", fingerprint: "AAA", running: true },
      ],
    };
    const svc = new TorService({
      http: createHttpClient(),
      ping: fakePing(),
      torControl: fakeTorControl(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.getStats(new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.metrics.nickname).toBe("MyRelay");
  });

  it("upstream 500 yields UnavailableError", async () => {
    state.status = 500;
    state.payload = {};
    const svc = new TorService({
      http: createHttpClient(),
      ping: fakePing(),
      torControl: fakeTorControl(),
      config: makeConfig(),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });

  it("connection failure yields UnavailableError", async () => {
    const svc = new TorService({
      http: createHttpClient(),
      ping: fakePing(),
      torControl: fakeTorControl(),
      config: makeConfig({ onionooBaseUrl: "http://127.0.0.1:1" }),
      now: () => 0,
    });
    const res = await svc.checkHealth(new AbortController().signal);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
  });

  describe("ControlPort path", () => {
    it("checkHealth circuit established → reachable", async () => {
      const info = new Map([["status/circuit-established", "1"]]);
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(true, 10),
        torControl: fakeTorControl(info),
        config: makeConfig({ useControlPort: true }),
        now: () => 100,
      });
      const res = await svc.checkHealth(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.reachable).toBe(true);
        expect(res.value.service?.reachable).toBe(true);
        expect(res.value.host?.reachable).toBe(true);
        expect(res.value.details?.circuitEstablished).toBe(true);
      }
    });

    it("checkHealth circuit not established → service unreachable, host reachable", async () => {
      const info = new Map([["status/circuit-established", "0"]]);
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(true, 10),
        torControl: fakeTorControl(info),
        config: makeConfig({ useControlPort: true }),
        now: () => 100,
      });
      const res = await svc.checkHealth(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.service?.reachable).toBe(false);
        expect(res.value.host?.reachable).toBe(true);
        expect(res.value.reachable).toBe(true);
        expect(res.value.details?.circuitEstablished).toBe(false);
      }
    });

    it("checkHealth connect fails → returns ok (ping still succeeds)", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(true, 10),
        torControl: failingTorControl(),
        config: makeConfig({ useControlPort: true }),
        now: () => 100,
      });
      const res = await svc.checkHealth(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.service?.reachable).toBe(false);
        expect(res.value.host?.reachable).toBe(true);
        expect(res.value.reachable).toBe(true);
      }
    });

    it("getStats returns traffic metrics from control port", async () => {
      const info = new Map([
        ["traffic/read", "10240"],
        ["traffic/written", "8192"],
        ["version/current", "0.4.8.10"],
        ["dormant", "0"],
        ["process/descriptor-limit", "65535"],
      ]);
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(info),
        config: makeConfig({ useControlPort: true }),
        now: () => 99,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.at).toBe(99);
        expect(res.value.metrics).toMatchObject({
          trafficRead: 10240,
          trafficWritten: 8192,
          version: "0.4.8.10",
          dormant: false,
          descriptorLimit: 65535,
        });
      }
    });

    it("getStats connect fails → err(UnavailableError)", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: failingTorControl(),
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBeInstanceOf(UnavailableError);
    });
  });

  describe("SETEVENTS subscription (B5)", () => {
    it("onStart subscribes to BW when useControlPort=true", async () => {
      const sub = makeFakeSub();
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(),
        eventSubscriptionFactory: makeFakeSubFactory(sub),
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      await svc.onStart?.();
      expect(sub.lastSetevents).toContain("BW");
    });

    it("onStop closes the subscription", async () => {
      const sub = makeFakeSub();
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(),
        eventSubscriptionFactory: makeFakeSubFactory(sub),
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      await svc.onStart?.();
      await svc.onStop?.();
      expect(sub.wasClosed).toBe(true);
    });

    it("BW event updates bwRead/bwWritten in getStats", async () => {
      const sub = makeFakeSub();
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(),
        eventSubscriptionFactory: makeFakeSubFactory(sub),
        config: makeConfig({ useControlPort: true }),
        now: () => 7,
      });
      await svc.onStart?.();
      sub.fire("BW", ["2048", "1024"]);
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.metrics.bwRead).toBe(2048);
        expect(res.value.metrics.bwWritten).toBe(1024);
      }
    });

    it("onStart is a no-op when useControlPort=false", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(),
        config: makeConfig({ useControlPort: false }),
        now: () => 0,
      });
      // Must not throw; no subscription created
      await svc.onStart?.();
      await svc.onStop?.();
    });
  });

  describe("traffic deltas (B6)", () => {
    it("first getStats has trafficDeltaRead=0 and trafficDeltaWritten=0", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(
          new Map([
            ["traffic/read", "10000"],
            ["traffic/written", "5000"],
          ])
        ),
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.metrics.trafficDeltaRead).toBe(0);
        expect(res.value.metrics.trafficDeltaWritten).toBe(0);
      }
    });

    it("second getStats returns diff of traffic/read and traffic/written", async () => {
      const poll1 = new Map([
        ["traffic/read", "1000"],
        ["traffic/written", "500"],
      ]);
      const poll2 = new Map([
        ["traffic/read", "4000"],
        ["traffic/written", "2500"],
      ]);
      // Each getStatsControlPort does 4 getinfo calls (core, accounting,
      // orconn/circuit listings, relay identity — ns/country are skipped when
      // identity is empty).
      const torControl = sequenceTorControl([
        poll1,
        new Map(),
        new Map(),
        new Map(),
        poll2,
        new Map(),
        new Map(),
        new Map(),
      ]);
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl,
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      await svc.getStats(new AbortController().signal); // first poll seeds baseline
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.metrics.trafficDeltaRead).toBe(3000);
        expect(res.value.metrics.trafficDeltaWritten).toBe(2000);
      }
    });
  });

  describe("local consensus telemetry (orconn/circuits/ns/geoip)", () => {
    const FP = "AAAA111122223333";
    const localInfo = new Map([
      ["traffic/read", "100"],
      ["traffic/written", "50"],
      ["version/current", "0.4.8.10"],
      [
        "orconn-status",
        "$f1~alpha CONNECTED\n$f2~beta CONNECTED\n$f3~gamma LAUNCHED",
      ],
      ["circuit-status", "1 BUILT $a,$b,$c\n2 BUILT $d,$e\n3 EXTENDED $f"],
      ["fingerprint", FP],
      ["address", "203.0.113.7"],
      [
        `ns/id/${FP}`,
        "r nick base64id digest 2026-06-12 00:00:00 203.0.113.7 9001 0\ns Fast Guard Running Stable Valid\nw Bandwidth=5400",
      ],
      ["ip-to-country/203.0.113.7", "de"],
    ]);

    it("getStats fills connections, circuits, flags, weight and country from the control port", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(localInfo),
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.metrics.connections).toEqual({
          current: 2,
          total: 3,
        });
        expect(res.value.metrics.circuits).toEqual({ active: 2, total: 3 });
        expect(res.value.metrics.fingerprint).toBe(FP);
        expect(res.value.metrics.flags).toBe("Fast,Guard,Running,Stable,Valid");
        expect(res.value.metrics.consensusWeight).toBe(5400);
        expect(res.value.metrics.country).toBe("de");
      }
    });

    it("getStats degrades to zero counts on a client-only node", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(
          new Map([
            ["traffic/read", "1"],
            ["traffic/written", "1"],
          ])
        ),
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.metrics.connections).toEqual({
          current: 0,
          total: 0,
        });
        expect(res.value.metrics.circuits).toEqual({ active: 0, total: 0 });
        expect(res.value.metrics.fingerprint).toBeUndefined();
      }
    });
  });

  describe("ControlPort → Onionoo fallback (off-LAN)", () => {
    it("checkHealth: ICMP fail + ControlPort fail → falls back to Onionoo, marks cooldown", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(false),
        torControl: failingTorControl(),
        config: makeConfig({ useControlPort: true }),
        now: () => 1_000,
      });
      const res = await svc.checkHealth(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        // Onionoo says relay is running → reachable
        expect(res.value.reachable).toBe(true);
        expect(res.value.details?.source).toBe("onionoo");
        expect(res.value.details?.controlPortReachable).toBe(false);
      }
      // Cooldown set: subsequent ControlPort calls would now be skipped.
      expect(state.lastSearch).toBe("MyRelay");
    });

    it("cooldown: subsequent checkHealth skips ControlPort entirely", async () => {
      let connectAttempts = 0;
      const counting: TorControlClient = {
        connect: async () => {
          connectAttempts++;
          throw new UnavailableError("refused");
        },
      };
      let nowMs = 1_000;
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(false),
        torControl: counting,
        config: makeConfig({ useControlPort: true }),
        now: () => nowMs,
      });
      await svc.checkHealth(new AbortController().signal); // first call → 1 attempt + cooldown set
      expect(connectAttempts).toBe(1);
      nowMs = 60_000; // < 5 min later: still in cooldown
      await svc.checkHealth(new AbortController().signal);
      await svc.checkHealth(new AbortController().signal);
      expect(connectAttempts).toBe(1); // ControlPort not retried during cooldown
    });

    it("cooldown expires after 5 min, ControlPort is retried", async () => {
      let connectAttempts = 0;
      const counting: TorControlClient = {
        connect: async () => {
          connectAttempts++;
          throw new UnavailableError("refused");
        },
      };
      let nowMs = 1_000;
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(false),
        torControl: counting,
        config: makeConfig({ useControlPort: true }),
        now: () => nowMs,
      });
      await svc.checkHealth(new AbortController().signal);
      expect(connectAttempts).toBe(1);
      nowMs = 1_000 + 5 * 60 * 1000 + 1; // past cooldown window
      await svc.checkHealth(new AbortController().signal);
      expect(connectAttempts).toBe(2);
    });

    it("successful ControlPort clears the cooldown", async () => {
      // First call: ICMP+ControlPort fail → cooldown set
      // Second call (after manual cooldown bypass): ControlPort works → cooldown cleared
      // Third call: ControlPort would be tried again
      let pingOk = false;
      let connectShouldFail = true;
      let connectAttempts = 0;
      const ping: PingProber = {
        probe: async () =>
          pingOk ? { success: true, avgMs: 5 } : { success: false },
      };
      const torControl: TorControlClient = {
        connect: async () => {
          connectAttempts++;
          if (connectShouldFail) throw new UnavailableError("refused");
          return {
            getinfo: async () => new Map([["status/circuit-established", "1"]]),
            getconf: async () => new Map(),
            signal: async () => undefined,
            close: async () => undefined,
          };
        },
      };
      let nowMs = 1_000;
      const svc = new TorService({
        http: createHttpClient(),
        ping,
        torControl,
        config: makeConfig({ useControlPort: true }),
        now: () => nowMs,
      });

      await svc.checkHealth(new AbortController().signal); // off-LAN, cooldown set
      expect(connectAttempts).toBe(1);

      // Simulate "back on LAN": expire cooldown, ICMP works, control works
      nowMs = 1_000 + 5 * 60 * 1000 + 1;
      pingOk = true;
      connectShouldFail = false;
      const onLan = await svc.checkHealth(new AbortController().signal);
      expect(connectAttempts).toBe(2);
      expect(onLan.ok).toBe(true);
      if (onLan.ok) expect(onLan.value.details?.source).toBe("control-port");

      // Cooldown was cleared by success → next failure shouldn't be skipped immediately
      pingOk = false;
      connectShouldFail = true;
      await svc.checkHealth(new AbortController().signal);
      expect(connectAttempts).toBe(3);
    });

    it("on-LAN ControlPort failure (ICMP up) does NOT trigger fallback — surfaces as service down", async () => {
      let connectAttempts = 0;
      const counting: TorControlClient = {
        connect: async () => {
          connectAttempts++;
          throw new UnavailableError("refused");
        },
      };
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(true, 5),
        torControl: counting,
        config: makeConfig({ useControlPort: true }),
        now: () => 1_000,
      });
      const res = await svc.checkHealth(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.details?.source).toBe("control-port");
        expect(res.value.host?.reachable).toBe(true);
        expect(res.value.service?.reachable).toBe(false);
      }
      // Cooldown NOT set — try again immediately
      await svc.checkHealth(new AbortController().signal);
      expect(connectAttempts).toBe(2);
    });

    it("getStats honors cooldown set by checkHealth and serves Onionoo metrics", async () => {
      let nowMs = 1_000;
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(false),
        torControl: failingTorControl(),
        config: makeConfig({ useControlPort: true }),
        now: () => nowMs,
      });
      await svc.checkHealth(new AbortController().signal); // sets cooldown
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.metrics.source).toBe("onionoo");
        expect(res.value.metrics.nickname).toBe("MyRelay");
        expect(res.value.metrics.relayType).toBe("guard");
      }
    });

    it("falls back to Onionoo gracefully even when relay is hibernating", async () => {
      state.payload = {
        relays: [
          {
            ...((state.payload as { relays: unknown[] }).relays[0] as object),
            hibernating: true,
          },
        ],
      };
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(false),
        torControl: failingTorControl(),
        config: makeConfig({ useControlPort: true }),
        now: () => 1_000,
      });
      const res = await svc.checkHealth(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.reachable).toBe(false);
        expect(res.value.details?.source).toBe("onionoo");
        expect(res.value.details?.warning).toMatch(/hibernat/i);
      }
    });
  });

  describe("Onionoo enrichment (B7)", () => {
    it("controlPort getStats merges country and consensusWeight from Onionoo", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(),
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        // Default state has a relay with country_name='United States', consensus_weight=1234
        expect(res.value.metrics.country).toBe("United States");
        expect(res.value.metrics.consensusWeight).toBe(1234);
      }
    });

    it("controlPort getStats still succeeds when Onionoo returns no relay", async () => {
      state.payload = { relays: [] };
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(),
        config: makeConfig({ useControlPort: true }),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true); // enrichment failure is non-fatal
      if (res.ok) {
        expect(res.value.metrics.country).toBeUndefined();
      }
    });

    it("controlPort getStats still succeeds when Onionoo request fails", async () => {
      const svc = new TorService({
        http: createHttpClient(),
        ping: fakePing(),
        torControl: fakeTorControl(),
        config: makeConfig({
          useControlPort: true,
          onionooBaseUrl: "http://127.0.0.1:1",
        }),
        now: () => 0,
      });
      const res = await svc.getStats(new AbortController().signal);
      expect(res.ok).toBe(true); // enrichment failure is non-fatal
    });
  });
});
