/** ZMQ message received from a Bitcoin Core ZMQ endpoint. */
export interface ZmqMessage {
  /** Topic string (e.g. 'hashblock', 'rawtx', 'hashtx'). */
  topic: string;
  /** Payload bytes. */
  data: Buffer;
  /** 4-byte little-endian sequence counter (wraps at 2^32). */
  sequence: number;
}

/** Handle for a live ZMQ subscription socket. */
export interface ZmqSubscriberHandle {
  /** Subscribe to inbound messages. Returns an unsubscribe function. */
  onMessage(handler: (msg: ZmqMessage) => void): () => void;
  /** Close the socket and stop dispatching messages. */
  close(): Promise<void>;
}

/**
 * Function that opens a ZMQ SUB socket, connects to `endpoint`, and subscribes
 * to `topics`. Injected as a dependency so real and fake implementations
 * are swappable without import mocking.
 *
 * Real implementation: `zmqConnect` from `./zmqSubscriberImpl.js`.
 * Fake implementation: test-local stub.
 */
export type ZmqConnectFn = (
  endpoint: string,
  topics: string[],
) => Promise<ZmqSubscriberHandle>;
