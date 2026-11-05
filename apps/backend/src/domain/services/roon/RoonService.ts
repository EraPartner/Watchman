import {
  BaseService,
  type HealthResult,
  type HostHealth,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { ok } from "../../../core/result.js";
import type { RoonInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type { TcpProber } from "../../../infra/net/tcpProbe.js";
import type {
  RoonConnectFn,
  RoonHandle,
} from "../../../infra/roon/roonClient.js";

export interface RoonDeps {
  ping: PingProber;
  tcp: TcpProber;
  config: RoonInstance;
  now: () => number;
  roonConnect?: RoonConnectFn;
}

export class RoonService extends BaseService {
  readonly kind = "roon";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly host: string;
  private readonly ports: ReadonlyArray<number>;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly usePing: boolean;
  private readonly apiPort: number;
  private readonly useRoonApi: boolean;
  private readonly pinger: PingProber;
  private readonly tcp: TcpProber;
  private readonly now: () => number;
  private readonly roonConnect: RoonConnectFn | undefined;
  private handle: RoonHandle | null = null;

  constructor(deps: RoonDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.ports = deps.config.ports;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.usePing = deps.config.usePing;
    this.apiPort = deps.config.apiPort;
    this.useRoonApi = deps.config.useRoonApi;
    this.pinger = deps.ping;
    this.tcp = deps.tcp;
    this.now = deps.now;
    this.roonConnect = deps.roonConnect;
  }

  override async onStart(): Promise<void> {
    if (!this.useRoonApi || !this.roonConnect) return;
    this.handle = await this.roonConnect({
      host: this.host,
      port: this.apiPort,
      extensionId: "com.watchman.roon",
      displayName: "Watchman",
    });
  }

  override async onStop(): Promise<void> {
    if (this.handle) {
      await this.handle.close();
      this.handle = null;
    }
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const pingPromise: Promise<{ success: boolean; avgMs?: number }> = this
      .usePing
      ? this.pinger.probe({
          host: this.host,
          timeoutMs: this.timeoutMs,
          count: this.pingCount,
          signal,
        })
      : Promise.resolve({ success: false });
    // with the Roon API on, its port is the one that matters: probe it too
    const probePorts =
      this.useRoonApi && !this.ports.includes(this.apiPort)
        ? [...this.ports, this.apiPort]
        : this.ports;
    const portPromises = probePorts.map((port) =>
      this.tcp.probe({
        host: this.host,
        port,
        timeoutMs: this.timeoutMs,
        signal,
      })
    );
    const [pingRes, ...portResults] = await Promise.all([
      pingPromise,
      ...portPromises,
    ]);

    const ports: Record<string, boolean> = {};
    probePorts.forEach((port, i) => {
      ports[String(port)] = Boolean(portResults[i]);
    });

    const anyPortOpen = Object.values(ports).some((v) => v);
    const icmpAlive = this.usePing && pingRes.success;
    const pingMs = this.usePing ? pingRes.avgMs : undefined;
    const host: HostHealth = {
      reachable: icmpAlive,
      ...(pingMs !== undefined ? { pingMs } : {}),
    };
    // pairing state from the live connection: an unpaired extension means
    // Roon has not (or no longer) enabled Watchman under Settings → Extensions
    const paired = this.useRoonApi
      ? (this.handle?.isPaired() ?? false)
      : undefined;
    const message =
      paired === false
        ? "Roon API not paired — enable Watchman in Roon under Settings → Extensions"
        : undefined;
    const service = {
      reachable: anyPortOpen,
      details: { ports },
      ...(message !== undefined ? { message } : {}),
    };
    const reachable = host.reachable || service.reachable;
    const latencyMs = pingRes.avgMs ?? this.now() - started;

    return ok({
      reachable,
      latencyMs,
      at: this.now(),
      host,
      service,
      ...(message !== undefined ? { message } : {}),
      details: {
        ...(paired !== undefined ? { paired } : {}),
        icmpAlive,
        anyPortOpen,
        ports,
        host: this.host,
        pingEnabled: this.usePing,
      },
    });
  }

  async getStats(_signal: AbortSignal): Promise<StatsResult> {
    const zones = this.handle?.getZones() ?? [];
    const paired = this.handle?.isPaired() ?? false;
    const activeZones = zones.filter((z) => z.state === "playing").length;
    const nowPlaying = zones.find((z) => z.state === "playing")?.nowPlaying
      ?.oneLine;

    return ok({
      at: this.now(),
      metrics: {
        host: this.host,
        portCount: this.ports.length,
        pingEnabled: this.usePing,
        configured: Boolean(this.host),
        ...(this.useRoonApi
          ? {
              paired,
              zoneCount: zones.length,
              activeZones,
              ...(nowPlaying !== undefined ? { nowPlaying } : {}),
              // per-zone detail is already in memory from the subscription
              zones: zones.map((z) => ({
                name: z.displayName,
                state: z.state,
                outputs: z.outputCount,
                ...(z.outputNames && z.outputNames.length > 0
                  ? { outputNames: z.outputNames }
                  : {}),
                queueItemsRemaining: z.queueItemsRemaining,
                queueTimeRemaining: z.queueTimeRemaining,
                ...(z.nowPlaying?.oneLine !== undefined
                  ? { nowPlaying: z.nowPlaying.oneLine }
                  : {}),
              })),
            }
          : {}),
      },
    });
  }
}
