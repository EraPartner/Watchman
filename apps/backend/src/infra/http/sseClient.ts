import { request, type Dispatcher } from "undici";

export interface SseStreamOptions {
  url: string;
  headers?: Record<string, string>;
  /** Custom dispatcher (e.g. a cert-pinned agent). */
  dispatcher?: Dispatcher;
  /** Called with each event's joined `data:` payload. */
  onMessage: (data: string) => void;
  onError?: (err: unknown) => void;
  /** Delay before reconnecting after a drop/failure (default 5s). */
  reconnectDelayMs?: number;
  /** Abort to stop the stream and the reconnect loop. */
  signal: AbortSignal;
}

export type SseStarter = (opts: SseStreamOptions) => void;

/**
 * Minimal Server-Sent-Events consumer with automatic reconnect. Runs as a
 * detached loop until the signal aborts; transport errors are reported via
 * onError and retried — SSE is an optimization layer, never a hard
 * dependency for the caller.
 */
export const startSseStream: SseStarter = (opts) => {
  const delayMs = opts.reconnectDelayMs ?? 5_000;
  void (async () => {
    while (!opts.signal.aborted) {
      try {
        await consumeOnce(opts);
      } catch (e) {
        if (opts.signal.aborted) return;
        opts.onError?.(e);
      }
      if (opts.signal.aborted) return;
      await sleep(delayMs, opts.signal);
    }
  })();
};

async function consumeOnce(opts: SseStreamOptions): Promise<void> {
  const res = await request(opts.url, {
    method: "GET",
    headers: { accept: "text/event-stream", ...opts.headers },
    ...(opts.dispatcher ? { dispatcher: opts.dispatcher } : {}),
    signal: opts.signal,
    // the stream stays open indefinitely; only the handshake is bounded
    bodyTimeout: 0,
    headersTimeout: 30_000,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    // drain to release the connection before throwing
    await res.body.text().catch(() => undefined);
    throw new Error(`sse endpoint returned ${res.statusCode}`);
  }

  let buffer = "";
  for await (const chunk of res.body) {
    buffer += chunk.toString();
    buffer = buffer.replace(/\r\n/g, "\n");
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) opts.onMessage(data);
      sep = buffer.indexOf("\n\n");
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
