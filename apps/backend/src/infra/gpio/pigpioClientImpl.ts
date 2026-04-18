import pigpio from 'pigpio-client';
import { TimeoutError, UnavailableError } from '../../core/errors.js';
import type { PigpioClient, PigpioClientRequest, PigpioHandle } from './pigpioClient.js';

interface RawPi {
  on(ev: string, fn: (...a: unknown[]) => void): void;
  once(ev: string, fn: (...a: unknown[]) => void): void;
  off?(ev: string, fn: (...a: unknown[]) => void): void;
  removeListener(ev: string, fn: (...a: unknown[]) => void): void;
  gpio(n: number): RawGpio;
  getInfo(): { pigpioVersion: string | number; hwVersion: string | number };
  getCurrentTick(cb: (err: Error | null, tick: number) => void): void;
  end(cb?: () => void): void;
}

interface RawGpio {
  read(cb: (err: Error | null, v: number) => void): void;
  write(level: 0 | 1, cb: (err: Error | null) => void): void;
  modeSet(mode: string, cb: (err: Error | null) => void): void;
}

function modeNumberToString(mode: number): string {
  return mode === 1 ? 'output' : 'input';
}

function waitConnected(pi: RawPi, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onConnected = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pi.removeListener('error', onError);
      resolve();
    };
    const onError = (...args: unknown[]): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pi.removeListener('connected', onConnected);
      const err = args[0];
      const msg = err instanceof Error ? err.message : String(err);
      reject(new UnavailableError(`pigpio connect failed: ${msg}`));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      pi.removeListener('connected', onConnected);
      pi.removeListener('error', onError);
      reject(new TimeoutError(`pigpio connect timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pi.once('connected', onConnected);
    pi.once('error', onError);
  });
}

function promisify0<T>(fn: (cb: (err: Error | null, v: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, v) => (err ? reject(new UnavailableError(err.message || String(err))) : resolve(v)));
  });
}

export function createPigpioClient(): PigpioClient {
  return {
    async connect(req: PigpioClientRequest): Promise<PigpioHandle> {
      const pi = (pigpio as { pigpio: (o: { host: string; port: number; timeout: number }) => RawPi })
        .pigpio({ host: req.host, port: req.port, timeout: Math.max(1, Math.ceil(req.timeoutMs / 60000)) });

      await waitConnected(pi, req.timeoutMs);

      const gpioCache = new Map<number, RawGpio>();
      const getGpio = (n: number): RawGpio => {
        let g = gpioCache.get(n);
        if (!g) {
          g = pi.gpio(n);
          gpioCache.set(n, g);
        }
        return g;
      };

      const toNum = (v: string | number): number => {
        if (typeof v === 'number') return v;
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      return {
        async read(gpio) {
          return await promisify0<number>((cb) => getGpio(gpio).read(cb));
        },
        async write(gpio, level) {
          await new Promise<void>((resolve, reject) => {
            getGpio(gpio).write(level, (err) =>
              err ? reject(new UnavailableError(err.message || String(err))) : resolve(),
            );
          });
        },
        async setMode(gpio, mode) {
          await new Promise<void>((resolve, reject) => {
            getGpio(gpio).modeSet(modeNumberToString(mode), (err) =>
              err ? reject(new UnavailableError(err.message || String(err))) : resolve(),
            );
          });
        },
        async getHardwareRevision() {
          return toNum(pi.getInfo().hwVersion);
        },
        async getPigpioVersion() {
          return toNum(pi.getInfo().pigpioVersion);
        },
        async getCurrentTick() {
          return await promisify0<number>((cb) => pi.getCurrentTick(cb));
        },
        async end() {
          await new Promise<void>((resolve) => pi.end(() => resolve()));
        },
      };
    },
  };
}
