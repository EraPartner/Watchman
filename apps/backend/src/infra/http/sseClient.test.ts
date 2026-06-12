import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import { startSseStream } from "./sseClient.js";

let server: Server;
let port: number;
let activeRes: ServerResponse | null = null;
let connections = 0;
let mode: "stream" | "error" = "stream";

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((_req, res) => {
        connections++;
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
    activeRes?.end();
    activeRes = null;
  });

  it("reconnects after the server drops the stream", async () => {
    mode = "stream";
    connections = 0;
    const abort = new AbortController();
    startSseStream({
      url: `http://127.0.0.1:${port}/events`,
      onMessage: () => undefined,
      reconnectDelayMs: 20,
      signal: abort.signal,
    });

    await waitFor(() => connections >= 1);
    activeRes?.end();
    activeRes = null;
    await waitFor(() => connections >= 2);

    abort.abort();
    activeRes?.end();
    activeRes = null;
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

  it("stops cleanly when aborted before any connection", async () => {
    const abort = new AbortController();
    abort.abort();
    expect(() =>
      startSseStream({
        url: `http://127.0.0.1:${port}/events`,
        onMessage: () => undefined,
        signal: abort.signal,
      })
    ).not.toThrow();
  });
});
