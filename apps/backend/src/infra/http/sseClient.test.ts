import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import { reconnectDelay, SseStatusError, startSseStream } from "./sseClient.js";

let server: Server;
let port: number;
let activeRes: ServerResponse | null = null;
let connections = 0;
let mode: "stream" | "error" | "unauthorized" = "stream";

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((_req, res) => {
        connections++;
        if (mode === "unauthorized") {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        if (mode === "error") {
          res.writeHead(503);
          res.end("unavailable");
          return;
        }
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        activeRes = res;
        res.write(": hi\n\n");
      });
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    })
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      activeRes?.end();
      server.close(() => resolve());
    })
);

// A function, not inline code: the server callback reassigns activeRes, which
// control-flow narrowing in the test body cannot see.
function endActiveResponse(): void {
  activeRes?.end();
  activeRes = null;
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs)
        return reject(new Error("waitFor timed out"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe("startSseStream", () => {
  it("delivers data events, including multi-line and chunk-split payloads", async () => {
    mode = "stream";
    const messages: string[] = [];
    const abort = new AbortController();
    startSseStream({
      url: `http://127.0.0.1:${port}/events`,
      onMessage: (d) => messages.push(d),
      signal: abort.signal,
    });

    await waitFor(() => activeRes !== null);
    activeRes!.write("data: hello\n\n");
    activeRes!.write("data: line1\ndata: line2\n\n");
    // payload split across writes
    activeRes!.write("data: par");
    activeRes!.write("tial\n\n");

    await waitFor(() => messages.length >= 3);
    expect(messages[0]).toBe("hello");
    expect(messages[1]).toBe("line1\nline2");
    expect(messages[2]).toBe("partial");

    abort.abort();
    endActiveResponse();
  });

  it("decodes multi-byte UTF-8 split across chunks", async () => {
    mode = "stream";
    const messages: string[] = [];
    const abort = new AbortController();
    startSseStream({
      url: `http://127.0.0.1:${port}/events`,
      onMessage: (d) => messages.push(d),
      signal: abort.signal,
    });

    await waitFor(() => activeRes !== null);
    const bytes = Buffer.from('data: {"name":"Küche"}\n\n', "utf8");
    const split = bytes.indexOf(0xc3) + 1; // between the two bytes of "ü"
    activeRes!.write(bytes.subarray(0, split));
    await new Promise((r) => setTimeout(r, 20));
    activeRes!.write(bytes.subarray(split));

    await waitFor(() => messages.length >= 1);
    expect(messages[0]).toBe('{"name":"Küche"}');

    abort.abort();
    endActiveResponse();
  });

  it("reconnects after the server drops the stream", async () => {
    mode = "stream";
    connections = 0;
    const abort = new AbortController();
    const errors: unknown[] = [];
    startSseStream({
      url: `http://127.0.0.1:${port}/events`,
      onMessage: () => undefined,
      onError: (e) => errors.push(e),
      reconnectDelayMs: 20,
      signal: abort.signal,
    });

    await waitFor(() => connections >= 1);
    endActiveResponse();
    await waitFor(() => connections >= 2);
    // a clean end loses events too, so callers are told (e.g. to re-seed)
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toMatch(/sse stream ended/);

    abort.abort();
    endActiveResponse();
  });

  it("reports non-2xx responses via onError and keeps retrying until aborted", async () => {
    mode = "error";
    connections = 0;
    const errors: unknown[] = [];
    const abort = new AbortController();
    startSseStream({
      url: `http://127.0.0.1:${port}/events`,
      onMessage: () => undefined,
      onError: (e) => errors.push(e),
      reconnectDelayMs: 20,
      signal: abort.signal,
    });

    await waitFor(() => errors.length >= 2);
    abort.abort();
    expect(String(errors[0])).toMatch(/503/);
    mode = "stream";
  });

  it("stops after a 401/403 handshake instead of retrying a refused credential", async () => {
    mode = "unauthorized";
    connections = 0;
    const errors: unknown[] = [];
    const abort = new AbortController();
    startSseStream({
      url: `http://127.0.0.1:${port}/events`,
      onMessage: () => undefined,
      onError: (e) => errors.push(e),
      reconnectDelayMs: 5,
      signal: abort.signal,
    });

    await waitFor(() => errors.length >= 1);
    // several reconnect delays' worth of time: no further attempt is made
    await new Promise((r) => setTimeout(r, 100));
    expect(connections).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(SseStatusError);
    expect((errors[0] as SseStatusError).statusCode).toBe(403);
    abort.abort();
    mode = "stream";
  });

  it("stops cleanly when aborted before any connection", () => {
    const abort = new AbortController();
    abort.abort();
    expect(() =>
      startSseStream({
        url: `http://127.0.0.1:${port}/events`,
        onMessage: () => undefined,
        signal: abort.signal,
      })
    ).not.toThrow();
    return Promise.resolve();
  });
});

describe("reconnectDelay", () => {
  it("doubles per consecutive failure and caps at the maximum", () => {
    expect(reconnectDelay(1, 5_000, 300_000)).toBe(5_000);
    expect(reconnectDelay(2, 5_000, 300_000)).toBe(10_000);
    expect(reconnectDelay(4, 5_000, 300_000)).toBe(40_000);
    expect(reconnectDelay(7, 5_000, 300_000)).toBe(300_000);
    expect(reconnectDelay(1_000, 5_000, 300_000)).toBe(300_000);
  });
});
