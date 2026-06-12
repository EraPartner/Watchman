import type { FastifyPluginAsync } from "fastify";
import type { GetServiceStatus } from "../../../application/GetServiceStatus.js";
import type { GetAggregatedHealth } from "../../../application/GetAggregatedHealth.js";
import type { ControlService } from "../../../application/ControlService.js";

export interface ServicesRouteDeps {
  getStatus: GetServiceStatus;
  aggregated: GetAggregatedHealth;
  control: ControlService;
}

export function servicesRoutes(deps: ServicesRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/services", async (req) => {
      const entries = await deps.aggregated.run(req.abortController.signal);
      return { data: entries };
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

    app.post<{
      Params: { kind: string };
      Querystring: { instance?: string };
      Body: { action: string };
    }>("/services/:kind/control", async (req, reply) => {
      const action = req.body?.action;
      if (typeof action !== "string" || action.length === 0) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION", message: "action required" } });
      }
      const result = await deps.control.run(
        req.params.kind,
        req.query.instance,
        action,
        req.abortController.signal
      );
      if (!result.ok)
        return reply
          .status(result.error.httpStatus)
          .send({
            error: { code: result.error.code, message: result.error.message },
          });
      return { data: { ok: true } };
    });
  };
}
