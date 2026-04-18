import type { PigpioClient } from '../../../infra/gpio/pigpioClient.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { RaspberryPiInstance } from '../../../config/services.js';

export interface PiHealthStatus {
  reachable: boolean;
  pigpioOnline: boolean;
  warning?: string;
  latencyMs: number;
}

export interface PiHealthDeps {
  pigpio: PigpioClient;
  ping: PingProber;
  config: RaspberryPiInstance;
  now: () => number;
}

export class PiHealthChecker {
  constructor(private readonly deps: PiHealthDeps) {}

  async check(signal: AbortSignal): Promise<PiHealthStatus> {
    const { pigpio, ping, config, now } = this.deps;
    const started = now();
    try {
      const handle = await pigpio.connect({
        host: config.host,
        port: config.port,
        timeoutMs: config.timeoutMs,
      });
      await handle.end().catch(() => undefined);
      return { reachable: true, pigpioOnline: true, latencyMs: now() - started };
    } catch (pigpioError) {
      const res = await ping.probe({
        host: config.host,
        timeoutMs: config.timeoutMs,
        count: config.pingCount,
        signal,
      });
      if (res.success) {
        const msg = pigpioError instanceof Error ? pigpioError.message : String(pigpioError);
        return {
          reachable: true,
          pigpioOnline: false,
          warning: `pigpiod unavailable: ${msg}`,
          latencyMs: res.avgMs ?? now() - started,
        };
      }
      return { reachable: false, pigpioOnline: false, latencyMs: now() - started };
    }
  }
}
