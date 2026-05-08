import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { withHostPing } from '../../health.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, isDomainError } from '../../../core/errors.js';
import type { HomebridgeInstance } from '../../../config/services.js';
import type { HomebridgeClient } from './homebridgeClient.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';

export interface HomebridgeDeps {
  client: HomebridgeClient;
  ping: PingProber;
  config: HomebridgeInstance;
  now: () => number;
}

interface ServerInformation {
  hostname?: string;
  platform?: string;
  homebridgeVersion?: string;
  serverVersion?: string;
  uptime?: number;
  [k: string]: unknown;
}

interface VersionInfo {
  installedVersion?: string;
  installed_version?: string;
  homebridge?: string;
  version?: string;
  homebridgeVersion?: string;
  homebridge_version?: string;
  serverVersion?: string;
  [k: string]: unknown;
}

function extractVersion(v: unknown): string {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return 'unknown';
  const obj = v as VersionInfo;
  return (
    obj.installedVersion ??
    obj.installed_version ??
    obj.homebridge ??
    obj.version ??
    obj.homebridgeVersion ??
    obj.homebridge_version ??
    obj.serverVersion ??
    'unknown'
  );
}

export class HomebridgeService extends BaseService {
  readonly kind = 'homebridge';
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly client: HomebridgeClient;
  private readonly statusPath: string;
  private readonly versionPath: string;
  private readonly timeoutMs: number;
  private readonly pinger: PingProber;
  private readonly pingHost: string;
  private readonly now: () => number;

  constructor(deps: HomebridgeDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.client = deps.client;
    this.statusPath = deps.config.statusPath;
    this.versionPath = deps.config.versionPath;
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    this.pingHost = new URL(deps.config.baseUrl).hostname;
    this.now = deps.now;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    return withHostPing(
      { host: this.pingHost, timeoutMs: this.timeoutMs, pingCount: 1, prober: this.pinger },
      async (sig) => {
        const started = this.now();
        const [status, version] = await Promise.all([
          this.client.get<ServerInformation>(this.statusPath, sig),
          this.client.get<VersionInfo | string>(this.versionPath, sig).catch(() => null),
        ]);
        const details: Record<string, unknown> = {};
        if (status?.hostname) details['hostname'] = status.hostname;
        const currentVersion = extractVersion(version);
        if (currentVersion !== 'unknown') details['currentVersion'] = currentVersion;
        return { reachable: true, latencyMs: this.now() - started, details };
      },
      this.now(),
      signal,
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [status, version] = await Promise.all([
        this.client.get<ServerInformation>(this.statusPath, signal),
        this.client.get<VersionInfo | string>(this.versionPath, signal).catch(() => null),
      ]);
      const info = status ?? {};
      return ok({
        at: this.now(),
        metrics: {
          hostname: info.hostname ?? '',
          platform: info.platform ?? '',
          homebridgeVersion: info.homebridgeVersion ?? '',
          serverVersion: info.serverVersion ?? '',
          uptime: typeof info.uptime === 'number' ? info.uptime : 0,
          currentVersion: extractVersion(version),
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`homebridge stats failed: ${msg}`));
    }
  }
}
