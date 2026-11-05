import { request, type Dispatcher } from "undici";
import { isAborted } from "../../core/abort.js";

export interface SseStreamOptions {
  url: string;
  headers?: Record<string, string>;
  /** Custom dispatcher (e.g. a cert-pinned agent). */
  dispatcher?: Dispatcher;
  /** Called with each event's joined `data:` payload. */
  onMessage: (data: string) => void;
  onError?: (err: unknown) => void;
  /** First delay before reconnecting after a drop/failure (default 5s). Each
   *  further failure in a row doubles it, up to maxReconnectDelayMs. */
  reconnectDelayMs?: number;
  /** Upper bound for the reconnect delay (default 5 min). */
  maxReconnectDelayMs?: number;
  /** Abort to stop the stream and the reconnect loop. */
  signal: AbortSignal;
}

export type SseStarter = (opts: SseStreamOptions) => void;

/** The endpoint answered the handshake with a non-2xx status. */
export class SseStatusError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`sse endpoint returned ${statusCode}`);
    this.statusCode = statusCode;
    this.name = "SseStatusError";
  }
}

/** 401/403 mean the credential was refused; retrying cannot fix that, and
 *  every retry is another rejected request at the device. */
export function isCredentialRejection(e: unknown): boolean {
  return (
    e instanceof SseStatusError &&
    (e.statusCode === 401 || e.statusCode === 403)
  );
}

/** Reconnect delay after `failures` consecutive failures (1-based). */
export function reconnectDelay(
  failures: number,
  baseMs: number,
  maxMs: number
): number {
  const exp = Math.min(Math.max(failures - 1, 0), 30);
  return Math.min(baseMs * 2 ** exp, maxMs);
}

/**
 * Minimal Server-Sent-Events consumer with automatic reconnect. Runs as a
 * detached loop until the signal aborts; transport errors and clean stream
 * ends are reported via onError and retried with exponential backoff — SSE is
 * an optimization layer, never a hard dependency for the caller. A 401/403
 * handshake is reported and ends the loop: the caller must start a new
 * stream (e.g. after the credential is re-saved).
 */
export const startSseStream: SseStarter = (opts) => {
  const baseMs = opts.reconnectDelayMs ?? 5_000;
  const maxMs = Math.max(opts.maxReconnectDelayMs ?? 300_000, baseMs);
  void (async () => {
    let failures = 0;
    while (!opts.signal.aborted) {
      const session = { opened: false };
      try {
        await consumeOnce(opts, session);
        // a clean end (server closed the stream) still loses the events sent
        // before the reconnect, so callers must hear about it like an error
        if (isAborted(opts.signal)) return;
        opts.onError?.(new Error("sse stream ended"));
      } catch (e) {
        if (isAborted(opts.signal)) return;
        opts.onError?.(e);
        if (isCredentialRejection(e)) return;
      }
      if (isAborted(opts.signal)) return;
      // a stream that was up counts as a fresh start; refused handshakes and
      // transport errors in a row back off further each time
      failures = session.opened ? 1 : failures + 1;
      await sleep(reconnectDelay(failures, baseMs, maxMs), opts.signal);
    }
  })();
};

async function consumeOnce(
  opts: SseStreamOptions,
  session: { opened: boolean }
): Promise<void> {
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
    throw new SseStatusError(res.statusCode);
  }
  session.opened = true;

  let buffer = "";
  // streaming decode: a multi-byte UTF-8 character can straddle two chunks
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        // per the SSE spec only a single leading space is stripped
        .map((line) => line.slice(line.startsWith("data: ") ? 6 : 5))
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
