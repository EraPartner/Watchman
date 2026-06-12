import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export interface RequestTimeoutOptions {
  timeoutMs: number;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Aborted when the request times out or the client disconnects, so
     *  in-flight service work is cancelled instead of running to completion
     *  behind an already-sent 504. */
    abortController: AbortController;
  }
}

const plugin: FastifyPluginAsync<RequestTimeoutOptions> = async (app, opts) => {
  const { timeoutMs } = opts;
  app.decorateRequest("abortController", null as unknown as AbortController);
  app.addHook("onRequest", async (req, reply) => {
    const ac = new AbortController();
    req.abortController = ac;
    const timer = setTimeout(() => {
      if (reply.sent) return;
      ac.abort(new Error("request timed out"));
      void reply
        .status(504)
        .send({ error: { code: "TIMEOUT", message: "request timed out" } });
    }, timeoutMs);
    const clear = (): void => clearTimeout(timer);
    reply.raw.once("finish", clear);
    reply.raw.once("close", () => {
      clear();
      if (!reply.raw.writableEnded) ac.abort(new Error("client disconnected"));
    });
    req.raw.once("aborted", () => {
      clear();
      ac.abort(new Error("client aborted"));
    });
  });
};

export const requestTimeoutPlugin = fp(plugin, { name: "requestTimeout" });
