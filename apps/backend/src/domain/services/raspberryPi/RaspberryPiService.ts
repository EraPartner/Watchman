import {
  BaseService,
  type Controllable,
  type HealthResult,
  type HostHealth,
  type ServiceHealth,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { ok, err, type Result } from "../../../core/result.js";
import {
  UnavailableError,
  ValidationError,
  isDomainError,
  type DomainError,
} from "../../../core/errors.js";
import type { RaspberryPiInstance } from "../../../config/services.js";
import type { PigpioClient } from "../../../infra/gpio/pigpioClient.js";
import {
  createSharedPigpioClient,
  type SharedPigpioClient,
} from "../../../infra/gpio/sharedPigpioClient.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type { SshExecutor } from "../../../infra/ssh/sshExecutor.js";
import { PiStatsCollector } from "./PiStatsCollector.js";
import { GpioController } from "./GpioController.js";

export interface RaspberryPiDeps {
  pigpio: PigpioClient;
  ping: PingProber;
  ssh: SshExecutor;
  config: RaspberryPiInstance;
  now: () => number;
}

export class RaspberryPiService extends BaseService implements Controllable {
  readonly kind = "raspberryPi";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly stats: PiStatsCollector;
  private readonly gpio: GpioController;
  private readonly host: string;
  private readonly piPort: number;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly pinger: PingProber;
  private readonly pigpioClient: SharedPigpioClient;
  private readonly now: () => number;

  constructor(deps: RaspberryPiDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.piPort = deps.config.port;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.pinger = deps.ping;
    // One persistent pigpiod connection shared by health checks, stats
    // collection and GPIO control instead of two connects per poll cycle.
    this.pigpioClient = createSharedPigpioClient(deps.pigpio);
    this.now = deps.now;
    this.stats = new PiStatsCollector({
      pigpio: this.pigpioClient,
      ssh: deps.ssh,
      config: deps.config,
      now: deps.now,
    });
    this.gpio = new GpioController({
      pigpio: this.pigpioClient,
      config: deps.config,
    });
  }

  override async onStop(): Promise<void> {
    await this.pigpioClient.close();
  }

  /**
   * GPIO control via pigpiod. Action grammar:
   *   gpio:write:<pin>:<0|1>          set an output pin level
   *   gpio:mode:<pin>:<input|output>  switch a pin's mode
   */
  async control(
    action: string,
    _signal: AbortSignal
  ): Promise<Result<void, DomainError>> {
    const [domain, op, pinRaw, arg] = action.split(":");
    if (domain !== "gpio") {
      return err(new ValidationError(`unsupported action: ${action}`));
    }
    const pin = Number(pinRaw);
    try {
      if (op === "write") {
        if (arg !== "0" && arg !== "1") {
          return err(
            new ValidationError(
              `gpio write level must be 0 or 1, got: ${arg ?? ""}`
            )
          );
        }
        await this.gpio.write(pin, arg === "1" ? 1 : 0);
        return ok(undefined);
      }
      if (op === "mode") {
        if (arg !== "input" && arg !== "output") {
          return err(
            new ValidationError(
              `gpio mode must be input or output, got: ${arg ?? ""}`
            )
          );
        }
        await this.gpio.setMode(pin, arg);
        return ok(undefined);
      }
      return err(new ValidationError(`unsupported gpio op: ${op ?? ""}`));
    } catch (e) {
      if (isDomainError(e)) return err(e);
      return err(
        new UnavailableError(e instanceof Error ? e.message : String(e))
      );
    }
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const [pingSettled, pigpioSettled] = await Promise.allSettled([
      this.pinger.probe({
        host: this.host,
        timeoutMs: this.timeoutMs,
        count: this.pingCount,
        signal,
      }),
      this.checkPigpio(),
    ]);

    const pingRes =
      pingSettled.status === "fulfilled" ? pingSettled.value : null;
    const host: HostHealth = pingRes
      ? {
          reachable: pingRes.success,
          ...(pingRes.avgMs !== undefined ? { pingMs: pingRes.avgMs } : {}),
        }
      : { reachable: false };

    const pigpioResult =
      pigpioSettled.status === "fulfilled"
        ? pigpioSettled.value
        : {
            online: false,
            error:
              pigpioSettled.reason instanceof Error
                ? pigpioSettled.reason.message
                : String(pigpioSettled.reason),
          };
    const service: ServiceHealth = {
      reachable: pigpioResult.online,
      ...(pigpioResult.error
        ? { message: `pigpiod unavailable: ${pigpioResult.error}` }
        : {}),
      details: { port: this.piPort },
    };

    const reachable = host.reachable || service.reachable;
    const latencyMs = pingRes?.avgMs ?? this.now() - started;
    const details: Record<string, unknown> = {
      host: this.host,
      pigpioOnline: pigpioResult.online,
    };
    if (service.message) details["warning"] = service.message;

    return ok({ reachable, latencyMs, at: this.now(), host, service, details });
  }

  private async checkPigpio(): Promise<{ online: boolean; error?: string }> {
    try {
      const handle = await this.pigpioClient.connect({
        host: this.host,
        port: this.piPort,
        timeoutMs: this.timeoutMs,
      });
      // the connection is shared/persistent, so liveness needs a real
      // round-trip rather than connect/teardown
      await handle.getCurrentTick();
      return { online: true };
    } catch (e) {
      return {
        online: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    try {
      const snap = await this.stats.collect(signal);
      return ok({ at: this.now(), metrics: { ...snap } });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`raspberryPi stats failed: ${msg}`));
    }
  }
}
