import type { PigpioClient } from '../../../infra/gpio/pigpioClient.js';
import type { RaspberryPiInstance } from '../../../config/services.js';
import { UnavailableError, ValidationError } from '../../../core/errors.js';

export type GpioMode = 'input' | 'output';
const MODE_INPUT = 0;
const MODE_OUTPUT = 1;

export interface GpioDeps {
  pigpio: PigpioClient;
  config: RaspberryPiInstance;
}

export class GpioController {
  constructor(private readonly deps: GpioDeps) {}

  async read(gpio: number): Promise<0 | 1> {
    this.validate(gpio);
    return this.withHandle(async (h) => {
      const v = await h.read(gpio);
      return (v === 1 ? 1 : 0) as 0 | 1;
    });
  }

  async write(gpio: number, level: 0 | 1): Promise<void> {
    this.validate(gpio);
    await this.withHandle((h) => h.write(gpio, level));
  }

  async setMode(gpio: number, mode: GpioMode): Promise<void> {
    this.validate(gpio);
    const m = mode === 'output' ? MODE_OUTPUT : MODE_INPUT;
    await this.withHandle((h) => h.setMode(gpio, m));
  }

  private validate(gpio: number): void {
    if (!Number.isInteger(gpio) || gpio < 0 || gpio > 53) {
      throw new ValidationError(`invalid gpio pin: ${gpio}`);
    }
  }

  private async withHandle<T>(fn: (h: Awaited<ReturnType<PigpioClient['connect']>>) => Promise<T>): Promise<T> {
    const c = this.deps.config;
    let handle;
    try {
      handle = await this.deps.pigpio.connect({ host: c.host, port: c.port, timeoutMs: c.timeoutMs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new UnavailableError(`pigpiod connect failed: ${msg}`);
    }
    try {
      return await fn(handle);
    } finally {
      await handle.end().catch(() => undefined);
    }
  }
}
