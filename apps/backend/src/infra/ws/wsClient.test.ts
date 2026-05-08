import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { createWsClient } from './wsClient.js';

function makeServer(): Promise<{ wss: WebSocketServer; port: number }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    wss.on('listening', () => {
      const port = (wss.address() as AddressInfo).port;
      resolve({ wss, port });
    });
  });
}

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('createWsClient', () => {
  let wss: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    ({ wss, port } = await makeServer());
  });

  afterEach(async () => {
    await new Promise<void>((r) => wss.close(() => r()));
  });

  it('fires onOpen when server accepts connection', async () => {
    const opened: string[] = [];
    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 100 });
    const unsub = client.onOpen(() => opened.push('open'));

    await waitFor(200);
    expect(opened).toEqual(['open']);
    expect(client.state).toBe('ready');

    unsub();
    client.destroy();
  });

  it('delivers send() messages to the server', async () => {
    const received: string[] = [];
    wss.on('connection', (ws: WsSocket) => {
      ws.on('message', (data) => received.push(String(data)));
    });

    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 100 });
    await waitFor(150);
    expect(client.state).toBe('ready');

    client.send('hello');
    client.send('world');
    await waitFor(100);

    expect(received).toEqual(['hello', 'world']);
    client.destroy();
  });

  it('fires onMessage for server-sent messages', async () => {
    wss.on('connection', (ws: WsSocket) => {
      ws.send('ping from server');
    });

    const messages: string[] = [];
    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 100 });
    client.onMessage((d) => messages.push(d));

    await waitFor(200);
    expect(messages).toEqual(['ping from server']);
    client.destroy();
  });

  it('buffers sends during connecting phase and flushes on open', async () => {
    const received: string[] = [];
    wss.on('connection', (ws: WsSocket) => {
      ws.on('message', (data) => received.push(String(data)));
    });

    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 100 });
    // Immediately after creation state is 'connecting'
    expect(client.state).toBe('connecting');
    client.send('buffered1');
    client.send('buffered2');

    await waitFor(200);
    expect(client.state).toBe('ready');
    expect(received).toEqual(['buffered1', 'buffered2']);
    client.destroy();
  });

  it('fires onClose when server closes the connection', async () => {
    const closed: number[] = [];
    wss.on('connection', (ws: WsSocket) => {
      setTimeout(() => ws.close(1001, 'bye'), 50);
    });

    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 5_000 });
    client.onClose((code) => closed.push(code));

    await waitFor(300);
    expect(closed).toEqual([1001]);
    expect(client.state).toBe('reconnecting');

    client.destroy();
  });

  it('reconnects automatically after server closes connection', async () => {
    const connectCount = { n: 0 };
    wss.on('connection', () => { connectCount.n += 1; });

    const opened: number[] = [];
    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 100, maxReconnectMs: 200 });
    client.onOpen(() => opened.push(Date.now()));

    // Wait for initial connect
    await waitFor(200);
    expect(connectCount.n).toBe(1);

    // Close the server-side socket to trigger disconnect
    for (const ws of wss.clients) ws.close();

    // Wait for reconnect (100ms backoff + connection time)
    await waitFor(400);
    expect(connectCount.n).toBeGreaterThanOrEqual(2);
    expect(opened.length).toBeGreaterThanOrEqual(2);
    expect(client.state).toBe('ready');

    client.destroy();
  });

  it('destroy() stops reconnect and clears handlers', async () => {
    const opened: number[] = [];
    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 100 });
    client.onOpen(() => opened.push(1));

    await waitFor(200);
    expect(opened.length).toBe(1);

    client.destroy();
    expect(client.state).toBe('destroyed');

    // Force a server-side close — no reconnect should happen
    for (const ws of wss.clients) ws.close();
    await waitFor(400);
    expect(opened.length).toBe(1); // no new opens after destroy
  });

  it('throw when send() called after destroy()', () => {
    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 100 });
    client.destroy();
    expect(() => client.send('nope')).toThrow('destroyed');
  });

  it('unsubscribe function removes the handler', async () => {
    const messages: string[] = [];
    wss.on('connection', (ws: WsSocket) => {
      setTimeout(() => ws.send('a'), 100);
      setTimeout(() => ws.send('b'), 200);
    });

    const client = createWsClient({ url: `ws://127.0.0.1:${port}`, reconnectMs: 100 });
    const unsub = client.onMessage((d) => messages.push(d));

    await waitFor(150); // receive 'a'
    unsub();            // unsubscribe before 'b' arrives
    await waitFor(150); // 'b' arrives but handler removed

    expect(messages).toEqual(['a']);
    client.destroy();
  });
});
