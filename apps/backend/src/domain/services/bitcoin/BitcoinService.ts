import {
  BaseService,
  type HealthResult,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { withHostPing } from "../../health.js";
import type { HttpClient, HttpResponse } from "../../../infra/http/client.js";
import { ok, err } from "../../../core/result.js";
import { withTimeout } from "../../../core/abort.js";
import {
  UnavailableError,
  UnauthorizedError,
  isDomainError,
} from "../../../core/errors.js";
import type { BitcoinInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type {
  ZmqConnectFn,
  ZmqSubscriberHandle,
} from "../../../infra/zmq/zmqSubscriber.js";

export interface BitcoinDeps {
  http: HttpClient;
  ping: PingProber;
  config: BitcoinInstance;
  now: () => number;
  /** Optional ZMQ connect function. When provided and ZMQ endpoints are
   *  configured, blocks/txs are streamed in real-time between poll cycles. */
  zmqConnect?: ZmqConnectFn;
}

interface RpcEnvelope<T> {
  result?: T;
  error?: { code?: number; message?: string } | null;
}

interface BlockchainInfo {
  chain?: string;
  blocks?: number;
  headers?: number;
  difficulty?: number;
  verificationprogress?: number;
  initialblockdownload?: boolean;
  size_on_disk?: number;
}

interface NetworkInfo {
  version?: number | string;
  subversion?: string;
  protocolversion?: number;
  connections?: number;
  connections_in?: number;
  connections_out?: number;
}

interface MempoolInfo {
  size?: number;
  bytes?: number;
  usage?: number;
  maxmempool?: number;
  mempoolminfee?: number;
}

interface NetTotals {
  totalbytesrecv?: number;
  totalbytessent?: number;
}

interface MiningInfo {
  networkhashps?: number;
  pooledtx?: number;
}

interface IndexInfo {
  txindex?: {
    synced?: boolean;
    best_block_height?: number;
  };
}

export class BitcoinService extends BaseService {
  readonly kind = "bitcoin";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly rpcUrl: string;
  private readonly authHeader: string | undefined;
  private readonly timeoutMs: number;
  private readonly pinger: PingProber;
  private readonly pingHost: string;
  private readonly now: () => number;
  private readonly zmqConnectFn: ZmqConnectFn | undefined;
  private readonly zmqHashblockEndpoint: string;
  private readonly zmqRawtxEndpoint: string;

  /** Live ZMQ subscription handle — set in onStart, cleared in onStop. */
  private zmqHandle: ZmqSubscriberHandle | null = null;
  /** Why the ZMQ subscription is not running (null when connected or unused). */
  private zmqError: string | null = null;
  /** Live rawtx subscription — the same handle as zmqHandle when both topics
   *  share one endpoint. */
  private zmqRawtxHandle: ZmqSubscriberHandle | null = null;
  /** Why the rawtx subscription is not running (null when connected or unused). */
  private zmqRawtxError: string | null = null;
  /** Running count of ZMQ rawtx events since last onStart. */
  private zmqTxCount = 0;
  private stopped = false;
  /** Hex hash of the most-recent block seen via ZMQ (empty = none yet). */
  private lastBlockHashZmq = "";
  /** Epoch-ms timestamp of the most-recent ZMQ hashblock event (0 = none). */
  private lastBlockAtZmq = 0;
  /** Running count of ZMQ hashblock events since last onStart. */
  private zmqBlockCount = 0;
  /** Whether the node's getzmqnotifications advertise a pubhashblock endpoint
   *  whose port matches the configured one (null = not checked / unknown). */
  private zmqEndpointMatch: boolean | null = null;
  /** pubhashblock endpoint(s) the node reports, comma-joined ('' = none). */
  private zmqServerHashblockEndpoint = "";

  constructor(deps: BitcoinDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.rpcUrl = deps.config.rpcUrl.replace(/\/+$/, "");
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    this.pingHost = new URL(deps.config.rpcUrl).hostname;
    this.now = deps.now;
    this.zmqConnectFn = deps.zmqConnect;
    this.zmqHashblockEndpoint = deps.config.zmqHashblockEndpoint;
    this.zmqRawtxEndpoint = deps.config.zmqRawtxEndpoint;
    if (deps.config.rpcUser && deps.config.rpcPassword) {
      const token = Buffer.from(
        `${deps.config.rpcUser}:${deps.config.rpcPassword}`
      ).toString("base64");
      this.authHeader = `Basic ${token}`;
    }
  }

  override async onStart(): Promise<void> {
    if (!this.zmqConnectFn) return;
    // one socket per endpoint: hashblock and rawtx share it when they match
    const topicsByEndpoint = new Map<string, string[]>();
    if (this.zmqHashblockEndpoint) {
      topicsByEndpoint.set(this.zmqHashblockEndpoint, ["hashblock"]);
    }
    if (this.zmqRawtxEndpoint) {
      const shared = topicsByEndpoint.get(this.zmqRawtxEndpoint);
      if (shared) shared.push("rawtx");
      else topicsByEndpoint.set(this.zmqRawtxEndpoint, ["rawtx"]);
    }
    if (topicsByEndpoint.size === 0) return;

    await Promise.all(
      [...topicsByEndpoint].map(([endpoint, topics]) =>
        this.openZmq(this.zmqConnectFn!, endpoint, topics)
      )
    );

    if (this.zmqHashblockEndpoint) await this.verifyZmqConfig();
  }

  private async openZmq(
    connect: ZmqConnectFn,
    endpoint: string,
    topics: string[]
  ): Promise<void> {
    const hashblock = topics.includes("hashblock");
    const rawtx = topics.includes("rawtx");
    try {
      const handle = await connect(endpoint, topics);
      // onStart is time-boxed by the lifecycle; if the service was stopped
      // while connecting, nothing else would ever close this handle
      if (this.stopped) {
        await handle.close();
        return;
      }
      if (hashblock) {
        this.zmqHandle = handle;
        this.zmqError = null;
      }
      if (rawtx) {
        this.zmqRawtxHandle = handle;
        this.zmqRawtxError = null;
      }
      handle.onMessage((msg) => {
        if (msg.topic === "hashblock") {
          this.lastBlockHashZmq = msg.data.toString("hex");
          this.lastBlockAtZmq = this.now();
          this.zmqBlockCount += 1;
        } else if (msg.topic === "rawtx") {
          // only counted; the transaction itself is not decoded or kept
          this.zmqTxCount += 1;
        }
      });
    } catch (e) {
      // ZMQ connection failure is non-fatal — service continues with poll-only
      // mode, but stats say why no blocks/txs arrive
      const reason = e instanceof Error ? e.message : String(e);
      if (hashblock) {
        this.zmqHandle = null;
        this.zmqError = reason;
      }
      if (rawtx) {
        this.zmqRawtxHandle = null;
        this.zmqRawtxError = reason;
      }
    }
  }

  /** Best-effort sanity check: does the node actually publish hashblock on a
   *  port matching the configured endpoint? Surfaced via stats so a silent
   *  ZMQ misconfiguration (no events ever arriving) is diagnosable. */
  private async verifyZmqConfig(): Promise<void> {
    if (!this.authHeader) return;
    try {
      const signal = withTimeout(this.timeoutMs);
      const notifs = await this.rpc<Array<{ type?: string; address?: string }>>(
        "getzmqnotifications",
        [],
        signal
      );
      if (!Array.isArray(notifs)) return;
      const hashblock = notifs
        .filter((n) => n.type === "pubhashblock")
        .map((n) => n.address ?? "")
        .filter(Boolean);
      this.zmqServerHashblockEndpoint = hashblock.join(",");
      if (hashblock.length === 0) {
        this.zmqEndpointMatch = false;
        return;
      }
      // the node may bind 0.0.0.0 while we connect to a concrete address, so
      // compare by port rather than full endpoint
      const configuredPort = endpointPort(this.zmqHashblockEndpoint);
      this.zmqEndpointMatch = hashblock.some(
        (e) => endpointPort(e) === configuredPort
      );
    } catch {
      this.zmqEndpointMatch = null;
    }
  }

  override async onStop(): Promise<void> {
    this.stopped = true;
    if (this.zmqRawtxHandle && this.zmqRawtxHandle !== this.zmqHandle) {
      await this.zmqRawtxHandle.close();
    }
    this.zmqRawtxHandle = null;
    if (this.zmqHandle) {
      await this.zmqHandle.close();
      this.zmqHandle = null;
    }
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
        const {
          results: [chainRaw, netRaw],
          errors,
        } = await this.rpcBatch(
          [{ method: "getblockchaininfo" }, { method: "getnetworkinfo" }],
          sig
        );
        const chain = chainRaw as BlockchainInfo | null;
        const net = netRaw as NetworkInfo | null;
        const latencyMs = this.now() - started;
        if (!chain || !chain.chain) {
          // e.g. -28 "Loading block index…" while the node warms up
          const reason = errors[0];
          return {
            reachable: false,
            latencyMs,
            ...(reason ? { message: `bitcoin rpc: ${reason}` } : {}),
            details: { warning: "bitcoin responding but data incomplete" },
          };
        }
        return {
          reachable: true,
          latencyMs,
          details: {
            chain: chain.chain,
            version: resolveVersion(net),
            blocks: chain.blocks ?? 0,
          },
        };
      },
      this.now(),
      signal
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      // single batched JSON-RPC request — one HTTP round-trip per cycle
      const {
        results: [
          chainRaw,
          netRaw,
          mempoolRaw,
          uptimeRaw,
          netTotalsRaw,
          miningRaw,
          indexRaw,
          fee1Raw,
          fee6Raw,
          fee144Raw,
        ],
        errors,
      } = await this.rpcBatch(
        [
          { method: "getblockchaininfo" },
          { method: "getnetworkinfo" },
          { method: "getmempoolinfo" },
          { method: "uptime" },
          { method: "getnettotals" },
          { method: "getmininginfo" },
          { method: "getindexinfo" },
          { method: "estimatesmartfee", params: [1] },
          { method: "estimatesmartfee", params: [6] },
          { method: "estimatesmartfee", params: [144] },
        ],
        signal
      );
      const chain = chainRaw as BlockchainInfo | null;
      const net = netRaw as NetworkInfo | null;
      const mempool = mempoolRaw as MempoolInfo | null;
      if (!chain || !net || !mempool) {
        const reason = errors[0] ?? errors[1] ?? errors[2];
        throw new UnavailableError(
          reason
            ? `bitcoin core rpc calls failed: ${reason}`
            : "bitcoin core rpc calls failed"
        );
      }
      const uptime = typeof uptimeRaw === "number" ? uptimeRaw : 0;
      const netTotals = netTotalsRaw as NetTotals | null;
      const miningInfo = miningRaw as MiningInfo | null;
      const indexInfo = indexRaw as IndexInfo | null;
      return ok({
        at: this.now(),
        metrics: {
          version: resolveVersion(net),
          protocolVersion: net.protocolversion ?? 0,
          chain: chain.chain ?? "unknown",
          blocks: chain.blocks ?? 0,
          headers: chain.headers ?? 0,
          connections: net.connections ?? 0,
          inbound: net.connections_in ?? 0,
          outbound: net.connections_out ?? 0,
          difficulty: chain.difficulty ?? 0,
          verificationProgress: chain.verificationprogress ?? 0,
          initialBlockDownload: Boolean(chain.initialblockdownload),
          blockchainSize: chain.size_on_disk ?? 0,
          // getblockchaininfo has no networkhashps; getmininginfo does
          networkHashPs: miningInfo?.networkhashps ?? 0,
          mempoolSize: mempool.size ?? 0,
          mempoolBytes: mempool.bytes ?? 0,
          mempoolUsage: mempool.usage ?? 0,
          mempoolMax: mempool.maxmempool ?? 0,
          mempoolMinFee: mempool.mempoolminfee ?? 0,
          uptime,
          // peer count comes free with getnetworkinfo; getpeerinfo (the
          // heaviest RPC, full per-peer detail) is intentionally not fetched
          peerCount: net.connections ?? 0,
          totalBytesRecv: netTotals?.totalbytesrecv ?? 0,
          totalBytesSent: netTotals?.totalbytessent ?? 0,
          hashesPerSec: miningInfo?.networkhashps ?? 0,
          txIndexSynced: Boolean(indexInfo?.txindex?.synced),
          txIndexHeight: indexInfo?.txindex?.best_block_height ?? 0,
          feeSatPerVb1: toSatPerVb(fee1Raw),
          feeSatPerVb6: toSatPerVb(fee6Raw),
          feeSatPerVb144: toSatPerVb(fee144Raw),
          // ZMQ real-time block data (present only when zmqHashblockEndpoint is configured)
          ...(this.zmqHashblockEndpoint
            ? {
                zmqLastBlockHash: this.lastBlockHashZmq,
                zmqLastBlockAt: this.lastBlockAtZmq,
                zmqBlockCount: this.zmqBlockCount,
                zmqConnected: this.zmqHandle !== null,
                zmqError: this.zmqError,
                zmqEndpointMatch: this.zmqEndpointMatch,
                zmqServerHashblockEndpoint: this.zmqServerHashblockEndpoint,
              }
            : {}),
          // ZMQ rawtx count since start (null when zmqRawtxEndpoint is unset)
          zmqTxCount: this.zmqRawtxEndpoint ? this.zmqTxCount : null,
          ...(this.zmqRawtxEndpoint
            ? {
                zmqRawtxConnected: this.zmqRawtxHandle !== null,
                zmqRawtxError: this.zmqRawtxError,
              }
            : {}),
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`bitcoin stats failed: ${msg}`));
    }
  }

  private async rpc<T>(
    method: string,
    params: unknown[],
    signal: AbortSignal
  ): Promise<T> {
    if (!this.authHeader) {
      throw new UnauthorizedError("bitcoin rpc credentials not configured");
    }
    const body = JSON.stringify({
      jsonrpc: "1.0",
      id: "watchman",
      method,
      params,
    });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: this.authHeader,
    };
    const res = await this.http.send({
      url: this.rpcUrl,
      method: "POST",
      headers,
      body,
      signal,
      timeoutMs: this.timeoutMs,
    });
    return this.parse<T>(res, method);
  }

  /**
   * Batched JSON-RPC: every call in one HTTP request. Per-call errors yield
   * null at that position plus the node's message in `errors` (callers decide
   * which results are required); transport/auth failures throw.
   */
  private async rpcBatch(
    calls: ReadonlyArray<{ method: string; params?: unknown[] }>,
    signal: AbortSignal
  ): Promise<{
    results: Array<unknown | null>;
    errors: Array<string | undefined>;
  }> {
    if (!this.authHeader) {
      throw new UnauthorizedError("bitcoin rpc credentials not configured");
    }
    const body = JSON.stringify(
      calls.map((c, i) => ({
        jsonrpc: "1.0",
        id: i,
        method: c.method,
        params: c.params ?? [],
      }))
    );
    const res = await this.http.send({
      url: this.rpcUrl,
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: this.authHeader,
      },
      body,
      signal,
      timeoutMs: this.timeoutMs,
    });
    if (res.status === 401) {
      const text = await res.text().catch(() => "");
      throw new UnauthorizedError(
        `bitcoin rpc auth failed: ${text.slice(0, 200)}`
      );
    }
    if (res.status === 403) {
      // rpcwhitelist rejects the whole batch when any method is not allowed
      const text = await res.text().catch(() => "");
      throw new UnauthorizedError(
        `bitcoin rpc user is not allowed one of the read methods (rpcwhitelist): ${text.slice(0, 200)}`
      );
    }
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      throw new UnavailableError(
        `bitcoin rpc batch returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    const env = await res.json<Array<RpcEnvelope<unknown> & { id?: number }>>();
    if (!Array.isArray(env)) {
      throw new UnavailableError("bitcoin rpc batch returned a non-array");
    }
    const byId = new Map(env.map((e) => [e.id, e]));
    const entries = calls.map((_, i) => byId.get(i));
    return {
      results: entries.map((entry) =>
        !entry || entry.error ? null : (entry.result ?? null)
      ),
      errors: entries.map((entry) =>
        entry?.error ? (entry.error.message ?? "unknown error") : undefined
      ),
    };
  }

  private async parse<T>(res: HttpResponse, method: string): Promise<T> {
    if (res.status === 401) {
      const text = await res.text().catch(() => "");
      throw new UnauthorizedError(
        `bitcoin rpc auth failed: ${text.slice(0, 200)}`
      );
    }
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      throw new UnavailableError(
        `bitcoin rpc ${method} returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    const env = await res.json<RpcEnvelope<T>>();
    if (env.error) {
      throw new UnavailableError(
        `bitcoin rpc ${method} error: ${env.error.message ?? "unknown"}`
      );
    }
    return env.result as T;
  }
}

function resolveVersion(net: NetworkInfo | null | undefined): string {
  if (!net) return "unknown";
  if (net.subversion) return cleanSubversion(net.subversion);
  if (typeof net.version === "number") return parseNumericVersion(net.version);
  if (typeof net.version === "string") return net.version;
  return "unknown";
}

function cleanSubversion(sub: string): string {
  const m = sub.match(/:(\d+\.\d+(?:\.\d+)?)/);
  return m && m[1] ? m[1] : sub.replace(/[/\s]/g, "") || "unknown";
}

function parseNumericVersion(v: number): string {
  if (v < 0) return "unknown";
  const major = Math.floor(v / 10000);
  const minor = Math.floor((v % 10000) / 100);
  const patch = v % 100;
  return `${major}.${minor}.${patch}`;
}

/** estimatesmartfee returns BTC/kvB; convert to sat/vB (null when the node
 *  has no estimate, e.g. fresh node or estimation disabled). */
function toSatPerVb(feeResult: unknown): number | null {
  if (!feeResult || typeof feeResult !== "object") return null;
  const feerate = (feeResult as { feerate?: unknown }).feerate;
  if (typeof feerate !== "number" || !Number.isFinite(feerate)) return null;
  return Math.round(feerate * 100_000 * 10) / 10;
}

function endpointPort(endpoint: string): string {
  const m = endpoint.match(/:(\d+)\/?$/);
  return m?.[1] ?? "";
}
