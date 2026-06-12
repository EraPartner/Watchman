import {
  BaseService,
  type HealthResult,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { withHostPing } from "../../health.js";
import type { HttpClient } from "../../../infra/http/client.js";
import { ok, err } from "../../../core/result.js";
import {
  UnavailableError,
  TimeoutError,
  isDomainError,
} from "../../../core/errors.js";
import { ttlMemo, type TtlMemo } from "../../../core/ttlMemo.js";
import type { IpfsInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";

export interface IpfsDeps {
  http: HttpClient;
  ping: PingProber;
  config: IpfsInstance;
  now: () => number;
}

interface DiagSys {
  MemoryAlloc?: number;
  GoNumGoroutine?: number;
  NumCPU?: number;
}

interface DhtEntry {
  Name?: string;
  Buckets?: number;
  PeerInfos?: unknown[];
}

interface PinLs {
  Keys?: Record<string, unknown>;
}

interface SwarmAddrsListen {
  Strings?: string[];
}

interface BitswapStat {
  BlocksReceived?: number;
  BlocksSent?: number;
  DataReceived?: number;
  DataSent?: number;
  DupBlksReceived?: number;
  MessagesReceived?: number;
  Wantlist?: unknown[];
}

// pin/ls returns the full pin list (large on big pin sets) and stats/dht
// walks every bucket — both change slowly, so refresh them on a slow lane
const SLOW_LANE_TTL_MS = 10 * 60 * 1000;

export class IpfsService extends BaseService {
  readonly kind = "ipfs";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pinger: PingProber;
  private readonly pingHost: string;
  private readonly now: () => number;
  private readonly pinLsMemo: TtlMemo<PinLs>;
  private readonly dhtMemo: TtlMemo<DhtEntry[]>;

  constructor(deps: IpfsDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.baseUrl = deps.config.apiUrl.replace(/\/+$/, "");
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    this.pingHost = new URL(deps.config.apiUrl).hostname;
    this.now = deps.now;
    this.pinLsMemo = ttlMemo(SLOW_LANE_TTL_MS, deps.now, (signal) =>
      this.post<PinLs>("/api/v0/pin/ls?type=recursive&quiet=true", signal)
    );
    this.dhtMemo = ttlMemo(SLOW_LANE_TTL_MS, deps.now, (signal) =>
      this.postNdjson<DhtEntry>("/api/v0/stats/dht", signal)
    );
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    return withHostPing(
      {
        host: this.pingHost,
        timeoutMs: this.timeoutMs,
        pingCount: 1,
        prober: this.pinger,
      },
      async (sig) => {
        const started = this.now();
        const res = await this.fetchVersion(sig);
        if (!res.ok) return { reachable: false, message: res.error.message };
        return {
          reachable: true,
          latencyMs: this.now() - started,
          details: { version: res.value },
        };
      },
      this.now(),
      signal
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [
        version,
        id,
        peers,
        repo,
        bw,
        diagSys,
        bitswap,
        dhtEntries,
        pinLs,
        listenAddrs,
      ] = await Promise.all([
        this.post<{ Version?: string }>("/api/v0/version", signal),
        this.post<{ ID?: string; Addresses?: string[] }>("/api/v0/id", signal),
        this.post<{ Peers?: unknown[] } | unknown[]>(
          "/api/v0/swarm/peers?format=json",
          signal
        ).catch(() => null),
        this.post<{ RepoSize?: number; NumObjects?: number }>(
          "/api/v0/repo/stat?format=json",
          signal
        ).catch(() => null),
        this.post<{
          TotalIn?: number;
          TotalOut?: number;
          RateIn?: number;
          RateOut?: number;
        }>("/api/v0/stats/bw?format=json", signal).catch(() => null),
        this.post<DiagSys>("/api/v0/diag/sys", signal).catch(
          (): DiagSys | null => null
        ),
        this.post<BitswapStat>("/api/v0/stats/bitswap", signal).catch(
          (): BitswapStat | null => null
        ),
        this.dhtMemo(signal).catch((): DhtEntry[] => []),
        this.pinLsMemo(signal).catch((): PinLs | null => null),
        this.post<SwarmAddrsListen>("/api/v0/swarm/addrs/listen", signal).catch(
          (): SwarmAddrsListen | null => null
        ),
      ]);

      const peersCount = Array.isArray(peers)
        ? peers.length
        : peers && Array.isArray((peers as { Peers?: unknown[] }).Peers)
          ? (peers as { Peers: unknown[] }).Peers.length
          : 0;

      const dhtPeers = dhtEntries.reduce(
        (sum, e) => sum + (e.PeerInfos?.length ?? 0),
        0
      );
      const pinnedCount = pinLs?.Keys ? Object.keys(pinLs.Keys).length : null;
      const listenAddrCount = listenAddrs?.Strings?.length ?? null;
      const memAllocMb =
        diagSys?.MemoryAlloc != null
          ? Math.round(diagSys.MemoryAlloc / 1_048_576)
          : null;

      return ok({
        at: this.now(),
        metrics: {
          version: version.Version ?? "unknown",
          nodeId: id.ID ?? null,
          addressCount: id.Addresses?.length ?? 0,
          peers: peersCount,
          repoSize: repo?.RepoSize ?? null,
          numObjects: repo?.NumObjects ?? null,
          bwTotalIn: bw?.TotalIn ?? null,
          bwTotalOut: bw?.TotalOut ?? null,
          bwRateIn: bw?.RateIn ?? null,
          bwRateOut: bw?.RateOut ?? null,
          memAllocMb,
          goroutines: diagSys?.GoNumGoroutine ?? null,
          numCPU: diagSys?.NumCPU ?? null,
          dhtPeers,
          pinnedCount,
          listenAddrCount,
          bitswapBlocksReceived: bitswap?.BlocksReceived ?? null,
          bitswapBlocksSent: bitswap?.BlocksSent ?? null,
          bitswapDataReceived: bitswap?.DataReceived ?? null,
          bitswapDataSent: bitswap?.DataSent ?? null,
          bitswapDupBlocks: bitswap?.DupBlksReceived ?? null,
          bitswapWantlistCount: bitswap?.Wantlist?.length ?? null,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      if (e instanceof Error)
        return err(new UnavailableError(`ipfs stats failed: ${e.message}`));
      return err(new UnavailableError("ipfs stats failed"));
    }
  }

  private async fetchVersion(signal: AbortSignal) {
    try {
      const body = await this.post<{ Version?: string; version?: string }>(
        "/api/v0/version",
        signal
      );
      return ok(body.Version ?? body.version ?? "unknown");
    } catch (e) {
      if (e instanceof TimeoutError) return err(e);
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`ipfs unreachable: ${msg}`));
    }
  }

  // Kubo's RPC is POST-only since 0.5 — a GET would just earn a 405.
  private async post<T>(path: string, signal: AbortSignal): Promise<T> {
    const res = await this.http.send({
      url: `${this.baseUrl}${path}`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
      signal,
      timeoutMs: this.timeoutMs,
    });
    return this.parse<T>(res, path);
  }

  // For endpoints that return newline-delimited JSON (NDJSON), e.g. stats/dht.
  private async postNdjson<T>(path: string, signal: AbortSignal): Promise<T[]> {
    const res = await this.http.send({
      url: `${this.baseUrl}${path}`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
      signal,
      timeoutMs: this.timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      throw new UnavailableError(
        `ipfs ${path} returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    const text = await res.text();
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }

  private async parse<T>(
    res: { status: number; text: () => Promise<string> },
    path: string
  ): Promise<T> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      throw new UnavailableError(
        `ipfs ${path} returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
}
