import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { Readable } from "node:stream";
import { requestTimeoutPlugin } from "./requestTimeout.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeApp(timeoutMs: number) {
  const app = Fastify();
  await app.register(requestTimeoutPlugin, { timeoutMs });
  return app;
}

describe("requestTimeoutPlugin", () => {
  it("answers 504 TIMEOUT and aborts the signal when the handler is too slow", async () => {
    const app = await makeApp(20);
    let signal: AbortSignal | undefined;
    app.get("/slow", async (req) => {
      signal = req.abortController.signal;
      await sleep(80);
      return { data: "late" };
    });
    const res = await app.inject({ method: "GET", url: "/slow" });
    expect(res.statusCode).toBe(504);
    expect(res.json()).toEqual({
      error: { code: "TIMEOUT", message: "request timed out" },
    });
    expect(signal?.aborted).toBe(true);
    await app.close();
  });

  it("does not time out a response whose streamed body has already started", async () => {
    const app = await makeApp(20);
    let signal: AbortSignal | undefined;
    app.get("/stream", async (req, reply) => {
      signal = req.abortController.signal;
      const body = new Readable({ read() {} });
      body.push("first,");
      setTimeout(() => {
        body.push("second");
        body.push(null);
      }, 80);
      return reply.type("text/plain").send(body);
    });
    const res = await app.inject({ method: "GET", url: "/stream" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("first,second");
    // Previously the timer fired mid-stream (reply.sent is false until the
    // body ends), aborted the request's signal and tried to send a 504.
    expect(signal?.aborted).toBe(false);
    await app.close();
  });
});
