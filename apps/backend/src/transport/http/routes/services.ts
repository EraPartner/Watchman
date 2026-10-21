import type { FastifyPluginAsync } from "fastify";
import type { GetServiceStatus } from "../../../application/GetServiceStatus.js";
import type { GetAggregatedHealth } from "../../../application/GetAggregatedHealth.js";

export interface ServicesRouteDeps {
  getStatus: GetServiceStatus;
  aggregated: GetAggregatedHealth;
}

export function servicesRoutes(deps: ServicesRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/services", async (req) => {
      const entries = await deps.aggregated.run(req.abortController.signal);
      // A failed Result carries a DomainError; JSON.stringify drops its
      // non-enumerable `message`, so project it to the documented
      // { code, message } shape (openapi AggregatedEntry).
      return {
        data: entries.map((e) =>
          e.result.ok
            ? e
            : {
                ...e,
                result: {
                  ok: false,
                  error: {
                    code: e.result.error.code,
                    message: e.result.error.message,
                  },
                },
              }
        ),
      };
    });

    app.get<{ Params: { kind: string }; Querystring: { instance?: string } }>(
      "/services/:kind/health",
      async (req, reply) => {
        const result = await deps.getStatus.health(
          req.params.kind,
          req.query.instance,
          req.abortController.signal
        );
        if (!result.ok)
          return reply
            .status(result.error.httpStatus)
            .send({
              error: { code: result.error.code, message: result.error.message },
            });
        return { data: result.value };
      }
    );

    app.get<{ Params: { kind: string }; Querystring: { instance?: string } }>(
      "/services/:kind/stats",
      async (req, reply) => {
        const result = await deps.getStatus.stats(
          req.params.kind,
          req.query.instance,
          req.abortController.signal
        );
        if (!result.ok)
          return reply
            .status(result.error.httpStatus)
            .send({
              error: { code: result.error.code, message: result.error.message },
            });
        return { data: result.value };
      }
    );
  };
}
