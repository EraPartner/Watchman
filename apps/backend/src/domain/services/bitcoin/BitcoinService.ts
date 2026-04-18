import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, UnauthorizedError, isDomainError } from '../../../core/errors.js';
import type { BitcoinInstance } from '../../../config/services.js';

export interface BitcoinDeps {
  http: HttpClient;
  config: BitcoinInstance;
  now: () => number;
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

export class BitcoinService extends BaseService {
  readonly kind = 'bitcoin';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly rpcUrl: string;
  private readonly authHeader: string | undefined;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(deps: BitcoinDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.rpcUrl = deps.config.rpcUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.config.timeoutMs;
    this.now = deps.now;
    if (deps.config.rpcUser && deps.config.rpcPassword) {
      const token = Buffer.from(`${deps.config.rpcUser}:${deps.config.rpcPassword}`).toString('base64');
      this.authHeader = `Basic ${token}`;
    }
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    try {
      const [chain, net] = await Promise.all([
        this.rpc<BlockchainInfo>('getblockchaininfo', [], signal),
        this.rpc<NetworkInfo>('getnetworkinfo', [], signal).catch(() => null),
      ]);
      const latencyMs = this.now() - started;
      if (!chain || !chain.chain) {
        return ok({
          reachable: false,
          latencyMs,
          at: this.now(),
          details: { warning: 'bitcoin responding but data incomplete' },
        });
      }
      return ok({
        reachable: true,
        latencyMs,
        at: this.now(),
        details: {
          chain: chain.chain,
          version: resolveVersion(net),
          blocks: chain.blocks ?? 0,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`bitcoin unreachable: ${msg}`));
    }
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [chain, net, mempool, uptime] = await Promise.all([
        this.rpc<BlockchainInfo>('getblockchaininfo', [], signal),
        this.rpc<NetworkInfo>('getnetworkinfo', [], signal),
        this.rpc<MempoolInfo>('getmempoolinfo', [], signal),
        this.rpc<number>('uptime', [], signal),
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
