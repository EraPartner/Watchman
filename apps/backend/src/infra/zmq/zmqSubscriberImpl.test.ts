import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mock zeromq via dynamic import interception ──────────────────────────────

interface FakeSubSocket {
  connect: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  [Symbol.asyncIterator]: () => AsyncIterator<Buffer[]>;
  emitFrames: (frames: Buffer[]) => void;
}

let socketInstance: FakeSubSocket | null = null;
let frameQueue: Buffer[][] = [];
let socketClosed = false;

function makeSubSocket(): FakeSubSocket {
  frameQueue = [];
  socketClosed = false;

  const sock: FakeSubSocket = {
    connect: vi.fn(),
    subscribe: vi.fn(),
    close: vi.fn(() => { socketClosed = true; }),
    emitFrames(frames) { frameQueue.push(frames); },
    [Symbol.asyncIterator]() {
      let idx = 0;
      return {
        async next() {
          // Poll until there's a frame or socket is closed
          while (true) {
            if (idx < frameQueue.length) {
              return { value: frameQueue[idx++]!, done: false };
            }
            if (socketClosed) return { value: undefined as unknown as Buffer[], done: true };
            await new Promise((r) => setTimeout(r, 5));
          }
        },
        return() { return Promise.resolve({ value: undefined as unknown as Buffer[], done: true }); },
      };
    },
  };
  socketInstance = sock;
  return sock;
}

vi.mock('zeromq', () => ({
  Subscriber: class {
    constructor() { return makeSubSocket(); }
  },
}));

import { zmqConnect } from './zmqSubscriberImpl.js';
import type { ZmqMessage } from './zmqSubscriber.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFrames(topic: string, data: Buffer, seq = 0): Buffer[] {
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeUInt32LE(seq, 0);
  return [Buffer.from(topic), data, seqBuf];
}

async function waitFor(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('zmqConnect', () => {
  beforeEach(() => {
    socketInstance = null;
    frameQueue = [];
    socketClosed = false;
  });

  it('connects to endpoint and subscribes to topics', async () => {
    const handle = await zmqConnect('tcp://127.0.0.1:28332', ['hashblock']);
    const sock = socketInstance!;

    expect(sock.connect).toHaveBeenCalledWith('tcp://127.0.0.1:28332');
    expect(sock.subscribe).toHaveBeenCalledWith('hashblock');

    await handle.close();
  });

  it('subscribes to multiple topics', async () => {
    const handle = await zmqConnect('tcp://127.0.0.1:28332', ['hashblock', 'rawtx']);
    const sock = socketInstance!;

    expect(sock.subscribe).toHaveBeenCalledWith('hashblock');
    expect(sock.subscribe).toHaveBeenCalledWith('rawtx');

    await handle.close();
  });

  it('delivers parsed messages to handlers', async () => {
    const handle = await zmqConnect('tcp://127.0.0.1:28332', ['hashblock']);
    const messages: ZmqMessage[] = [];
    handle.onMessage((m) => messages.push(m));

    const data = Buffer.alloc(32, 0xab);
    socketInstance!.emitFrames(makeFrames('hashblock', data, 42));

    await waitFor(50);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.topic).toBe('hashblock');
    expect(messages[0]?.data).toStrictEqual(data);
    expect(messages[0]?.sequence).toBe(42);

    await handle.close();
  });

  it('handles missing sequence buffer (defaults to 0)', async () => {
    const handle = await zmqConnect('tcp://127.0.0.1:28332', ['hashblock']);
    const messages: ZmqMessage[] = [];
    handle.onMessage((m) => messages.push(m));

    // Only 2 frames, no sequence buffer
    socketInstance!.emitFrames([Buffer.from('hashblock'), Buffer.from('data')]);

    await waitFor(50);

    expect(messages[0]?.sequence).toBe(0);

    await handle.close();
  });

  it('onMessage returns unsubscribe function', async () => {
    const handle = await zmqConnect('tcp://127.0.0.1:28332', ['hashblock']);
    const received: ZmqMessage[] = [];

    const unsub = handle.onMessage((m) => received.push(m));
    unsub();

    socketInstance!.emitFrames(makeFrames('hashblock', Buffer.from('data'), 1));
    await waitFor(50);

    expect(received).toHaveLength(0);

    await handle.close();
  });

  it('close() stops message delivery', async () => {
    const handle = await zmqConnect('tcp://127.0.0.1:28332', ['hashblock']);
    const received: ZmqMessage[] = [];
    handle.onMessage((m) => received.push(m));

    await handle.close();
    socketInstance!.emitFrames(makeFrames('hashblock', Buffer.from('post-close'), 99));
    await waitFor(30);

    expect(received).toHaveLength(0);
    expect(socketInstance!.close).toHaveBeenCalled();
  });

  it('close() clears all handlers', async () => {
    const handle = await zmqConnect('tcp://127.0.0.1:28332', ['hashblock']);
    const received1: number[] = [];
    const received2: number[] = [];
    handle.onMessage((m) => received1.push(m.sequence));
    handle.onMessage((m) => received2.push(m.sequence));

    await handle.close();

    socketInstance!.emitFrames(makeFrames('hashblock', Buffer.from('data'), 5));
    await waitFor(30);

    expect(received1).toHaveLength(0);
    expect(received2).toHaveLength(0);
  });

  it('close() is idempotent', async () => {
    const handle = await zmqConnect('tcp://127.0.0.1:28332', ['hashblock']);
    await handle.close();
    await expect(handle.close()).resolves.toBeUndefined();
  });
});
