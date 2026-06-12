import {
  BaseService,
  type HealthResult,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { withHostPing } from "../../health.js";
import { ok, err } from "../../../core/result.js";
import { UnavailableError, isDomainError } from "../../../core/errors.js";
import { ttlMemo, type TtlMemo } from "../../../core/ttlMemo.js";
import type { HomebridgeInstance } from "../../../config/services.js";
import type { HomebridgeClient } from "./homebridgeClient.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";

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
  latestVersion?: string;
  updateAvailable?: boolean;
  [k: string]: unknown;
}

interface CpuStatus {
  currentLoad?: number;
  cpuTemperature?: { main?: number | null };
}

interface RamStatus {
  mem?: { total?: number; free?: number; used?: number; active?: number };
}

interface UptimeStatus {
  time?: { uptime?: number };
  processUptime?: number;
}

interface HomebridgeStatus {
  status?: string;
}

interface ChildBridge {
  status?: string;
  name?: string;
}

interface PluginInfo {
  updateAvailable?: boolean;
}

const CPU_PATH = "/api/status/cpu";
const RAM_PATH = "/api/status/ram";
const UPTIME_PATH = "/api/status/uptime";
const HB_STATUS_PATH = "/api/status/homebridge";
const CHILD_BRIDGES_PATH = "/api/status/homebridge/child-bridges";
const PLUGINS_PATH = "/api/plugins";
const ACCESSORIES_PATH = "/api/accessories";

// version (npm lookup server-side) and the plugin list are slow/expensive on
// the UI server — refresh them on a slow lane instead of every poll
const SLOW_LANE_TTL_MS = 15 * 60 * 1000;

function extractVersion(v: unknown): string {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object") return "unknown";
  const obj = v as VersionInfo;
  return (
    obj.installedVersion ??
    obj.installed_version ??
    obj.homebridge ??
    obj.version ??
    obj.homebridgeVersion ??
    obj.homebridge_version ??
    obj.serverVersion ??
    "unknown"
  );
}

const RUNNING_CHILD_STATES = new Set(["ok", "up", "running"]);

export class HomebridgeService extends BaseService {
  readonly kind = "homebridge";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly client: HomebridgeClient;
  private readonly statusPath: string;
  private readonly timeoutMs: number;
  private readonly pinger: PingProber;
  private readonly pingHost: string;
  private readonly now: () => number;
  private readonly versionMemo: TtlMemo<VersionInfo | string>;
  private readonly pluginsMemo: TtlMemo<PluginInfo[]>;

  constructor(deps: HomebridgeDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.client = deps.client;
    this.statusPath = deps.config.statusPath;
    this.timeoutMs = deps.config.timeoutMs;
    this.pinger = deps.ping;
    this.pingHost = new URL(deps.config.baseUrl).hostname;
    this.now = deps.now;
    this.versionMemo = ttlMemo(SLOW_LANE_TTL_MS, deps.now, (signal) =>
      this.client.get<VersionInfo | string>(deps.config.versionPath, signal)
    );
    this.pluginsMemo = ttlMemo(SLOW_LANE_TTL_MS, deps.now, (signal) =>
      this.client.get<PluginInfo[]>(PLUGINS_PATH, signal)
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
        const [status, version] = await Promise.all([
          this.client.get<ServerInformation>(this.statusPath, sig),
          this.versionMemo(sig).catch(() => null),
        ]);
        const details: Record<string, unknown> = {};
        if (status?.hostname) details["hostname"] = status.hostname;
        const currentVersion = extractVersion(version);
        if (currentVersion !== "unknown")
          details["currentVersion"] = currentVersion;
        return { reachable: true, latencyMs: this.now() - started, details };
      },
      this.now(),
      signal
    );
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const [
        status,
        version,
        cpu,
        ram,
        uptimeStatus,
        hbStatus,
        childBridges,
        plugins,
        accessories,
      ] = await Promise.all([
        this.client.get<ServerInformation>(this.statusPath, signal),
        this.versionMemo(signal).catch(() => null),
        this.client
          .get<CpuStatus>(CPU_PATH, signal)
          .catch((): CpuStatus | null => null),
        this.client
          .get<RamStatus>(RAM_PATH, signal)
          .catch((): RamStatus | null => null),
        this.client
          .get<UptimeStatus>(UPTIME_PATH, signal)
          .catch((): UptimeStatus | null => null),
        this.client
          .get<HomebridgeStatus>(HB_STATUS_PATH, signal)
          .catch((): HomebridgeStatus | null => null),
        this.client
          .get<ChildBridge[]>(CHILD_BRIDGES_PATH, signal)
          .catch((): ChildBridge[] | null => null),
        this.pluginsMemo(signal).catch((): PluginInfo[] | null => null),
        // requires Homebridge insecure mode; null when unavailable
        this.client
          .get<unknown[]>(ACCESSORIES_PATH, signal)
          .catch((): unknown[] | null => null),
      ]);
      const info = status ?? {};
      const childList = Array.isArray(childBridges) ? childBridges : null;
      const pluginList = Array.isArray(plugins) ? plugins : null;
      const versionInfo =
        version && typeof version === "object"
          ? (version as VersionInfo)
          : null;
      return ok({
        at: this.now(),
        metrics: {
          hostname: info.hostname ?? "",
          platform: info.platform ?? "",
          homebridgeVersion: info.homebridgeVersion ?? "",
          serverVersion: info.serverVersion ?? "",
          uptime: typeof info.uptime === "number" ? info.uptime : 0,
          currentVersion: extractVersion(version),
          latestVersion: versionInfo?.latestVersion ?? null,
          updateAvailable: versionInfo?.updateAvailable ?? null,
          status: hbStatus?.status ?? null,
          cpuLoad:
            typeof cpu?.currentLoad === "number"
              ? Math.round(cpu.currentLoad * 100) / 100
              : null,
          cpuTemp: cpu?.cpuTemperature?.main ?? null,
          memTotalBytes: ram?.mem?.total ?? null,
          memUsedBytes: ram?.mem?.active ?? ram?.mem?.used ?? null,
          hostUptime: uptimeStatus?.time?.uptime ?? null,
          processUptime: uptimeStatus?.processUptime ?? null,
          childBridgeCount: childList?.length ?? null,
          childBridgesUp: childList
            ? childList.filter((b) =>
                RUNNING_CHILD_STATES.has((b.status ?? "").toLowerCase())
              ).length
            : null,
          pluginCount: pluginList?.length ?? null,
          pluginUpdatesAvailable: pluginList
            ? pluginList.filter((p) => p.updateAvailable === true).length
            : null,
          accessoryCount: Array.isArray(accessories)
            ? accessories.length
            : null,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`homebridge stats failed: ${msg}`));
    }
  }
}
