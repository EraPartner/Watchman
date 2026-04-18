import { BaseService, type HealthResult, type PollPolicy, type StatsResult } from '../../BaseService.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, isDomainError } from '../../../core/errors.js';
import type { HomebridgeInstance } from '../../../config/services.js';
import type { HomebridgeClient } from './homebridgeClient.js';

export interface HomebridgeDeps {
  client: HomebridgeClient;
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
  private readonly now: () => number;

  constructor(deps: HomebridgeDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.client = deps.client;
    this.statusPath = deps.config.statusPath;
    this.versionPath = deps.config.versionPath;
    this.now = deps.now;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    try {
      const [status, version] = await Promise.all([
        this.client.get<ServerInformation>(this.statusPath, signal),
        this.client.get<VersionInfo | string>(this.versionPath, signal).catch(() => null),
      ]);
      const details: Record<string, unknown> = {};
      if (status?.hostname) details['hostname'] = status.hostname;
      const currentVersion = extractVersion(version);
      if (currentVersion !== 'unknown') details['currentVersion'] = currentVersion;
      return ok({
        reachable: true,
        latencyMs: this.now() - started,
        at: this.now(),
        details,
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`homebridge unreachable: ${msg}`));
    }
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
