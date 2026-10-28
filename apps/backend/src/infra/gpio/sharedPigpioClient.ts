import type {
  PigpioClient,
  PigpioClientRequest,
  PigpioHandle,
} from "./pigpioClient.js";
import { TimeoutError } from "../../core/errors.js";

export interface SharedPigpioClient extends PigpioClient {
  /** Close the underlying connection (e.g. on service teardown). */
  close(): Promise<void>;
}

/**
 * PigpioClient wrapper that keeps one live pigpiod connection and hands out
 * non-owning handles: `end()` on a handed-out handle is a no-op, so health
 * checks and stats collection share a single TCP connection
 * instead of opening and tearing one down per call. A failed command
 * invalidates the connection; the next call reconnects.
 */
export function createSharedPigpioClient(
  inner: PigpioClient
): SharedPigpioClient {
  let live: PigpioHandle | null = null;
  let connecting: Promise<PigpioHandle> | null = null;
  // bumped by close(): a connect that was in flight when close() ran must
  // not install its handle afterwards, or that connection leaks
  let generation = 0;

  function invalidate(): void {
    const h = live;
    live = null;
    if (h) void h.end().catch(() => undefined);
  }

  async function acquire(req: PigpioClientRequest): Promise<PigpioHandle> {
    if (live) return live;
    if (!connecting) {
      const gen = generation;
      const attempt: Promise<PigpioHandle> = inner.connect(req).then(
        (h) => {
          if (gen !== generation) {
            void h.end().catch(() => undefined);
            throw new Error("pigpio client closed");
          }
          live = h;
          if (connecting === attempt) connecting = null;
          return h;
        },
        (e: unknown) => {
          if (connecting === attempt) connecting = null;
          throw e;
        }
      );
      connecting = attempt;
    }
    return connecting;
  }

  async function guarded<T>(
    req: PigpioClientRequest,
    fn: (h: PigpioHandle) => Promise<T>
  ): Promise<T> {
    const h = await acquire(req);
    // A pigpiod that loses power mid-connection never answers, and pigpio
    // commands have no timeout of their own; bound each one so a health
    // check can't hang forever.
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new TimeoutError(`pigpio command timed out after ${req.timeoutMs}ms`)
          ),
        req.timeoutMs
      );
    });
    try {
      return await Promise.race([fn(h), deadline]);
    } catch (e) {
      if (live === h) invalidate();
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async connect(req: PigpioClientRequest): Promise<PigpioHandle> {
      // connect errors must still surface to the caller
      await acquire(req);
      return {
        read: (gpio) => guarded(req, (h) => h.read(gpio)),
        getHardwareRevision: () => guarded(req, (h) => h.getHardwareRevision()),
        getPigpioVersion: () => guarded(req, (h) => h.getPigpioVersion()),
        getCurrentTick: () => guarded(req, (h) => h.getCurrentTick()),
        end: async () => undefined,
      };
    },
    async close(): Promise<void> {
      generation++;
      const h = live;
      live = null;
      connecting = null;
      if (h) await h.end().catch(() => undefined);
    },
  };
}
