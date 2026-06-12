import type {
  PigpioClient,
  PigpioClientRequest,
  PigpioHandle,
} from "./pigpioClient.js";

export interface SharedPigpioClient extends PigpioClient {
  /** Close the underlying connection (e.g. on service teardown). */
  close(): Promise<void>;
}

/**
 * PigpioClient wrapper that keeps one live pigpiod connection and hands out
 * non-owning handles: `end()` on a handed-out handle is a no-op, so health
 * checks, stats collection and GPIO control share a single TCP connection
 * instead of opening and tearing one down per call. A failed command
 * invalidates the connection; the next call reconnects.
 */
export function createSharedPigpioClient(
  inner: PigpioClient
): SharedPigpioClient {
  let live: PigpioHandle | null = null;
  let connecting: Promise<PigpioHandle> | null = null;

  function invalidate(): void {
    const h = live;
    live = null;
    if (h) void h.end().catch(() => undefined);
  }

  async function acquire(req: PigpioClientRequest): Promise<PigpioHandle> {
    if (live) return live;
    if (!connecting) {
      connecting = inner.connect(req).then(
        (h) => {
          live = h;
          connecting = null;
          return h;
        },
        (e: unknown) => {
          connecting = null;
          throw e;
        }
      );
    }
    return connecting;
  }

  async function guarded<T>(
    req: PigpioClientRequest,
    fn: (h: PigpioHandle) => Promise<T>
  ): Promise<T> {
    const h = await acquire(req);
    try {
      return await fn(h);
    } catch (e) {
      invalidate();
      throw e;
    }
  }

  return {
    async connect(req: PigpioClientRequest): Promise<PigpioHandle> {
      // connect errors must still surface to the caller
      await acquire(req);
      return {
        read: (gpio) => guarded(req, (h) => h.read(gpio)),
        write: (gpio, level) => guarded(req, (h) => h.write(gpio, level)),
        setMode: (gpio, mode) => guarded(req, (h) => h.setMode(gpio, mode)),
        getHardwareRevision: () => guarded(req, (h) => h.getHardwareRevision()),
        getPigpioVersion: () => guarded(req, (h) => h.getPigpioVersion()),
        getCurrentTick: () => guarded(req, (h) => h.getCurrentTick()),
        end: async () => undefined,
      };
    },
    async close(): Promise<void> {
      const h = live;
      live = null;
      connecting = null;
      if (h) await h.end().catch(() => undefined);
    },
  };
}
