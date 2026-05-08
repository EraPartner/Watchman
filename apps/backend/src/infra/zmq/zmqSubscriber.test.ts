import { describe, it, expect } from 'vitest';
import type { ZmqMessage, ZmqSubscriberHandle } from './zmqSubscriber.js';

// ---------------------------------------------------------------------------
// Fake handle — stands in for the real zeromq-backed implementation in tests
// ---------------------------------------------------------------------------

function makeFakeHandle(): {
  handle: ZmqSubscriberHandle;
  emit: (msg: ZmqMessage) => void;
} {
  const handlers = new Set<(msg: ZmqMessage) => void>();
  let closed = false;

  const handle: ZmqSubscriberHandle = {
    onMessage(h) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    async close() {
      closed = true;
      handlers.clear();
    },
  };

  const emit = (msg: ZmqMessage) => {
    if (!closed) {
      for (const h of handlers) h(msg);
    }
  };

  return { handle, emit };
}

function hashblockMsg(seq = 0): ZmqMessage {
  return { topic: 'hashblock', data: Buffer.alloc(32, seq), sequence: seq };
}

// ---------------------------------------------------------------------------
// Contract tests — verify the ZmqSubscriberHandle interface expectations
// ---------------------------------------------------------------------------

describe('ZmqSubscriberHandle contract (fake implementation)', () => {
  it('delivers messages to all subscribed handlers', () => {
    const { handle, emit } = makeFakeHandle();
    const a: ZmqMessage[] = [];
    const b: ZmqMessage[] = [];
    handle.onMessage((m) => a.push(m));
    handle.onMessage((m) => b.push(m));

    emit(hashblockMsg(1));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]?.topic).toBe('hashblock');
    expect(a[0]?.sequence).toBe(1);
  });

  it('unsubscribe removes handler; subsequent messages are not delivered', () => {
    const { handle, emit } = makeFakeHandle();
    const received: number[] = [];

    const unsub = handle.onMessage((m) => received.push(m.sequence));
    emit(hashblockMsg(1));
    unsub();
    emit(hashblockMsg(2));

    expect(received).toEqual([1]);
  });

  it('close() stops message delivery to all handlers', async () => {
    const { handle, emit } = makeFakeHandle();
    const received: number[] = [];

    handle.onMessage((m) => received.push(m.sequence));
    await handle.close();
    emit(hashblockMsg(1));

    expect(received).toHaveLength(0);
  });

  it('close() is idempotent', async () => {
    const { handle } = makeFakeHandle();
    await expect(handle.close()).resolves.toBeUndefined();
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it('ZmqMessage carries topic, data buffer, and sequence', () => {
    const { handle, emit } = makeFakeHandle();
    const msgs: ZmqMessage[] = [];
    handle.onMessage((m) => msgs.push(m));

    const data = Buffer.from('deadbeef', 'hex');
    emit({ topic: 'rawtx', data, sequence: 42 });

    expect(msgs[0]?.topic).toBe('rawtx');
    expect(msgs[0]?.data).toStrictEqual(data);
    expect(msgs[0]?.sequence).toBe(42);
  });
});
