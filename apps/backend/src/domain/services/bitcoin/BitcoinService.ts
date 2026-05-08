import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { withHostPing } from '../../health.js';
import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, UnauthorizedError, isDomainError } from '../../../core/errors.js';
import type { BitcoinInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { ZmqConnectFn, ZmqSubscriberHandle } from '../../../infra/zmq/zmqSubscriber.js';

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
  networkhashps?: number;
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

interface PeerInfo {
  addr?: string;
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
  readonly kind = 'bitcoin';
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
  /** Hex hash of the most-recent block seen via ZMQ (empty = none yet). */
  private lastBlockHashZmq = '';
  /** Epoch-ms timestamp of the most-recent ZMQ hashblock event (0 = none). */
  private lastBlockAtZmq = 0;
  /** Running count of ZMQ hashblock events since last onStart. */
  private zmqBlockCount = 0;

  constructor(deps: BitcoinDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.rpcUrl = deps.config.rpcUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    this.pingHost = new URL(deps.config.rpcUrl).hostname;
    this.now = deps.now;
    this.zmqConnectFn = deps.zmqConnect;
    this.zmqHashblockEndpoint = deps.config.zmqHashblockEndpoint;
    this.zmqRawtxEndpoint = deps.config.zmqRawtxEndpoint;
    if (deps.config.rpcUser && deps.config.rpcPassword) {
      const token = Buffer.from(`${deps.config.rpcUser}:${deps.config.rpcPassword}`).toString('base64');
      this.authHeader = `Basic ${token}`;
    }
  }

  override async onStart(): Promise<void> {
    if (!this.zmqConnectFn || !this.zmqHashblockEndpoint) return;

    try {
      const topics = ['hashblock'];
      if (this.zmqRawtxEndpoint && this.zmqRawtxEndpoint !== this.zmqHashblockEndpoint) {
        // Different endpoints — connect them separately but share a topic filter
      }
      this.zmqHandle = await this.zmqConnectFn(this.zmqHashblockEndpoint, topics);
      this.zmqHandle.onMessage((msg) => {
        if (msg.topic === 'hashblock') {
          this.lastBlockHashZmq = msg.data.toString('hex');
          this.lastBlockAtZmq = this.now();
          this.zmqBlockCount += 1;
        }
      });
    } catch {
      // ZMQ connection failure is non-fatal — service continues with poll-only mode
      this.zmqHandle = null;
    }
  }

  override async onStop(): Promise<void> {
    if (this.zmqHandle) {
      await this.zmqHandle.close();
      this.zmqHandle = null;
    }
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    return withHostPing(
      { host: this.pingHost, timeoutMs: this.timeoutMs, pingCount: 1, prober: this.pinger },
      async (sig) => {
        const started = this.now();
        const [chain, net] = await Promise.all([
          this.rpc<BlockchainInfo>('getblockchaininfo', [], sig),
          this.rpc<NetworkInfo>('getnetworkinfo', [], sig).catch(() => null),
        ]);
        const latencyMs = this.now() - started;
        if (!chain || !chain.chain) {
          return { reachable: false, latencyMs, details: { warning: 'bitcoin responding but data incomplete' } };
        }
        return {
          reachable: true,
          latencyMs,
          details: { chain: chain.chain, version: resolveVersion(net), blocks: chain.blocks ?? 0 },
        };
      },
      this.now(),
      signal,
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [chain, net, mempool, uptime, peers, netTotals, miningInfo, indexInfo] = await Promise.all([
        this.rpc<BlockchainInfo>('getblockchaininfo', [], signal),
        this.rpc<NetworkInfo>('getnetworkinfo', [], signal),
        this.rpc<MempoolInfo>('getmempoolinfo', [], signal),
        this.rpc<number>('uptime', [], signal),
        this.rpc<PeerInfo[]>('getpeerinfo', [], signal).catch(() => null),
        this.rpc<NetTotals>('getnettotals', [], signal).catch(() => null),
        this.rpc<MiningInfo>('getmininginfo', [], signal).catch(() => null),
        this.rpc<IndexInfo>('getindexinfo', [], signal).catch(() => null),
      ]);
      return ok({
        at: this.now(),
        metrics: {
          version: resolveVersion(net),
          protocolVersion: net.protocolversion ?? 0,
          chain: chain.chain ?? 'unknown',
          blocks: chain.blocks ?? 0,
          headers: chain.headers ?? 0,
          connections: net.connections ?? 0,
          inbound: net.connections_in ?? 0,
          outbound: net.connections_out ?? 0,
          difficulty: chain.difficulty ?? 0,
          verificationProgress: chain.verificationprogress ?? 0,
          initialBlockDownload: Boolean(chain.initialblockdownload),
          blockchainSize: chain.size_on_disk ?? 0,
          networkHashPs: chain.networkhashps ?? 0,
          mempoolSize: mempool.size ?? 0,
          mempoolBytes: mempool.bytes ?? 0,
          mempoolUsage: mempool.usage ?? 0,
          mempoolMax: mempool.maxmempool ?? 0,
          mempoolMinFee: mempool.mempoolminfee ?? 0,
          uptime: uptime ?? 0,
          peerCount: peers?.length ?? 0,
          totalBytesRecv: netTotals?.totalbytesrecv ?? 0,
          totalBytesSent: netTotals?.totalbytessent ?? 0,
          hashesPerSec: miningInfo?.networkhashps ?? 0,
          txIndexSynced: Boolean(indexInfo?.txindex?.synced),
          txIndexHeight: indexInfo?.txindex?.best_block_height ?? 0,
          // ZMQ real-time block data (present only when zmqHashblockEndpoint is configured)
          ...(this.zmqHashblockEndpoint
            ? {
                zmqLastBlockHash: this.lastBlockHashZmq,
                zmqLastBlockAt: this.lastBlockAtZmq,
                zmqBlockCount: this.zmqBlockCount,
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

  private async rpc<T>(method: string, params: unknown[], signal: AbortSignal): Promise<T> {
    if (!this.authHeader) {
      throw new UnauthorizedError('bitcoin rpc credentials not configured');
    }
    const body = JSON.stringify({ jsonrpc: '1.0', id: 'watchman', method, params });
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: this.authHeader,
    };
    const res = await this.http.send({
      url: this.rpcUrl,
      method: 'POST',
      headers,
      body,
      signal,
      timeoutMs: this.timeoutMs,
    });
    return this.parse<T>(res, method);
  }

  private async parse<T>(res: HttpResponse, method: string): Promise<T> {
    if (res.status === 401) {
      const text = await res.text().catch(() => '');
      throw new UnauthorizedError(`bitcoin rpc auth failed: ${text.slice(0, 200)}`);
    }
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '');
      throw new UnavailableError(`bitcoin rpc ${method} returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const env = await res.json<RpcEnvelope<T>>();
    if (env.error) {
      throw new UnavailableError(`bitcoin rpc ${method} error: ${env.error.message ?? 'unknown'}`);
    }
    return env.result as T;
  }
}

function resolveVersion(net: NetworkInfo | null | undefined): string {
  if (!net) return 'unknown';
  if (net.subversion) return cleanSubversion(net.subversion);
  if (typeof net.version === 'number') return parseNumericVersion(net.version);
  if (typeof net.version === 'string') return net.version;
  return 'unknown';
}

function cleanSubversion(sub: string): string {
  const m = sub.match(/:(\d+\.\d+(?:\.\d+)?)/);
  return m && m[1] ? m[1] : sub.replace(/[/\s]/g, '') || 'unknown';
}

function parseNumericVersion(v: number): string {
  if (v < 0) return 'unknown';
  const major = Math.floor(v / 10000);
  const minor = Math.floor((v % 10000) / 100);
  const patch = v % 100;
  return `${major}.${minor}.${patch}`;
}
