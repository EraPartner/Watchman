import type {
  ZmqConnectFn,
  ZmqMessage,
  ZmqSubscriberHandle,
} from "./zmqSubscriber.js";

/** Zeromq v6+ Subscriber socket shape (subset used here). */
type SubSocket = {
  connect(ep: string): void;
  subscribe(topic: string | Uint8Array): void;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<Buffer[]>;
};

type ZeromqModule = { Subscriber: new () => SubSocket };

/**
 * Real ZMQ subscriber backed by the `zeromq` npm package (v6+, ESM-native, N-API).
 *
 * Uses dynamic import so a missing `zeromq` installation does NOT crash the
 * process at startup — the error surfaces only when a ZMQ endpoint is actually
 * configured.
 *
 * Install:
 *   npm run deps:ci
 *   # Then verify the arm64 build on Pi passes the I6 gate:
 *   node -e "require('zeromq')"
 */
export const zmqConnect: ZmqConnectFn = async (endpoint, topics) => {
  let zmqMod: ZeromqModule;
  try {
    // @ts-expect-error — zeromq has no @types package; types resolved at runtime
    zmqMod = (await import("zeromq")) as ZeromqModule;
  } catch (e) {
    throw new Error(
      `zeromq not installed — cannot connect to ${endpoint}. ` +
        `Run from the repository root: npm run deps:ci  ` +
        `(then verify the arm64 build on Pi with the I6 gate). ` +
        `Cause: ${String(e)}`
    );
  }

  const sock = new zmqMod.Subscriber();
  sock.connect(endpoint);
  for (const topic of topics) sock.subscribe(topic);

  const handlers = new Set<(msg: ZmqMessage) => void>();
  let closed = false;

  void (async () => {
    try {
      for await (const frames of sock) {
        if (closed) break;
        const [topicBuf, data, seqBuf] = frames;
        const topic = (topicBuf as Buffer).toString();
        const sequence = seqBuf ? (seqBuf as Buffer).readUInt32LE(0) : 0;
        const msg: ZmqMessage = { topic, data: data as Buffer, sequence };
        for (const h of handlers) h(msg);
      }
    } catch {
      // Socket closed — normal teardown
    }
  })();

  return {
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async close() {
      closed = true;
      handlers.clear();
      try {
        sock.close();
      } catch {
        /* already closed */
      }
    },
  } satisfies ZmqSubscriberHandle;
};
