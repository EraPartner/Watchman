import type { Logger } from 'pino';

export type WsState = 'connecting' | 'ready' | 'reconnecting' | 'destroyed';

export interface WsClientOptions {
  url: string;
  /** Base reconnect delay in ms (default: 2000). Doubles each attempt up to maxReconnectMs. */
  reconnectMs?: number;
  /** Maximum reconnect backoff in ms (default: 30000). */
  maxReconnectMs?: number;
  logger?: Logger;
}

export interface WsClientHandle {
  send(data: string): void;
  /** Subscribe to inbound text messages. Returns an unsubscribe function. */
  onMessage(handler: (data: string) => void): () => void;
  /** Subscribe to open events. Returns an unsubscribe function. */
  onOpen(handler: () => void): () => void;
  /** Subscribe to close events. Returns an unsubscribe function. */
  onClose(handler: (code: number, reason: string) => void): () => void;
  destroy(): void;
  readonly state: WsState;
}

const DEFAULT_RECONNECT_MS = 2_000;
const DEFAULT_MAX_RECONNECT_MS = 30_000;

export function createWsClient(opts: WsClientOptions): WsClientHandle {
  const baseDelay = opts.reconnectMs ?? DEFAULT_RECONNECT_MS;
  const maxDelay = opts.maxReconnectMs ?? DEFAULT_MAX_RECONNECT_MS;
  const log = opts.logger;

  let state: WsState = 'connecting';
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = baseDelay;

  const messageHandlers = new Set<(data: string) => void>();
  const openHandlers = new Set<() => void>();
  const closeHandlers = new Set<(code: number, reason: string) => void>();
  const sendBuffer: string[] = [];

  function connect(): void {
    if (state === 'destroyed') return;
    state = 'connecting';

    const ws = new WebSocket(opts.url);
    socket = ws;

    ws.addEventListener('open', () => {
      if (state === 'destroyed') { ws.close(); return; }
      state = 'ready';
      reconnectDelay = baseDelay; // reset backoff on success
      log?.debug({ url: opts.url }, 'wsClient connected');

      for (const msg of sendBuffer.splice(0)) {
        try { ws.send(msg); } catch { /* socket closed before flush */ }
      }

      for (const h of openHandlers) h();
    });

    ws.addEventListener('message', (evt) => {
      if (typeof evt.data !== 'string') return;
      for (const h of messageHandlers) h(evt.data);
    });

    ws.addEventListener('close', (evt) => {
      if (state === 'destroyed') return;
      const code = evt.code ?? 1006;
      const reason = evt.reason ?? '';
      log?.warn({ url: opts.url, code, reason }, 'wsClient disconnected');

      for (const h of closeHandlers) h(code, reason);
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // 'error' always fires before 'close' in the browser WS spec; let 'close' drive reconnect
      log?.warn({ url: opts.url }, 'wsClient error');
    });
  }

  function scheduleReconnect(): void {
    if (state === 'destroyed') return;
    state = 'reconnecting';
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
    log?.debug({ url: opts.url, delayMs: delay }, 'wsClient scheduling reconnect');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  // Initial connection
  connect();

  return {
    get state() { return state; },

    send(data: string): void {
      if (state === 'destroyed') throw new Error('wsClient is destroyed');
      if (state === 'ready' && socket) {
        socket.send(data);
      } else {
        // Buffer while connecting; discard while reconnecting (connection lost, delivery not guaranteed)
        if (state === 'connecting') {
          sendBuffer.push(data);
        }
      }
    },

    onMessage(handler: (data: string) => void): () => void {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },

    onOpen(handler: () => void): () => void {
      openHandlers.add(handler);
      return () => openHandlers.delete(handler);
    },

    onClose(handler: (code: number, reason: string) => void): () => void {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },

    destroy(): void {
      if (state === 'destroyed') return;
      state = 'destroyed';
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (socket) { socket.close(); socket = null; }
      messageHandlers.clear();
      openHandlers.clear();
      closeHandlers.clear();
      sendBuffer.length = 0;
    },
  };
}
