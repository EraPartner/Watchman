import Fastify from "fastify";
import compress from "@fastify/compress";
import type { Logger } from "pino";
import { metaRoutes } from "./routes/meta.js";
import { servicesRoutes, type ServicesRouteDeps } from "./routes/services.js";
import { instancesRoutes } from "./routes/instances.js";
import { metricsRoutes } from "./routes/metrics.js";
import { configRoutes, type ConfigRouteDeps } from "./routes/config.js";
import { profileRoutes, type ProfileRouteDeps } from "./routes/profiles.js";
import { setupRoutes, type SetupRouteDeps } from "./routes/setup.js";
import { errorHandlerPlugin } from "./plugins/errorHandler.js";
import { requestTimeoutPlugin } from "./plugins/requestTimeout.js";
import { logSamplingPlugin } from "./plugins/logSampling.js";
import type { ListInstances } from "../../application/ListInstances.js";
import type { MetricsRegistry } from "../../core/metrics.js";
import { createOriginPolicy, type OriginPredicate } from "../originPolicy.js";

export interface BuildServerDeps {
  logger: Logger;
  services: ServicesRouteDeps;
  listInstances: ListInstances;
  metrics: MetricsRegistry;
  config: ConfigRouteDeps;
  profiles: ProfileRouteDeps;
  setup: SetupRouteDeps;
  requestTimeoutMs?: number | undefined;
  healthLogSampleRate?: number | undefined;
  trustProxy?: boolean | undefined;
  isOriginAllowed?: OriginPredicate | undefined;
}

export async function buildServer(deps: BuildServerDeps) {
  const app = Fastify({
    loggerInstance: deps.logger,
    disableRequestLogging: false,
    trustProxy: deps.trustProxy ?? false,
    bodyLimit: 1 * 1024 * 1024,
  });

  const isOriginAllowed = deps.isOriginAllowed ?? createOriginPolicy();

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (typeof origin === "string") {
      if (isOriginAllowed(origin)) {
        reply.header("Access-Control-Allow-Origin", origin);
        reply.header("Vary", "Origin");
        reply.header("Access-Control-Allow-Credentials", "true");
        reply.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization"
        );
        reply.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        );
        if (request.method === "OPTIONS") {
          return reply.code(204).send();
        }
      } else if (request.method === "OPTIONS") {
        return reply.code(403).send();
      }
    } else if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  await app.register(logSamplingPlugin, {
    healthSampleRate: deps.healthLogSampleRate ?? 20,
  });
  await app.register(requestTimeoutPlugin, {
    timeoutMs: deps.requestTimeoutMs ?? 15_000,
  });
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ["br", "gzip"],
  });
  await app.register(errorHandlerPlugin);
  await app.register(metaRoutes);
  await app.register(metricsRoutes(deps.metrics));
  await app.register(servicesRoutes(deps.services));
  await app.register(instancesRoutes(deps.listInstances));
  await app.register(setupRoutes(deps.setup));
  await app.register(configRoutes(deps.config));
  await app.register(profileRoutes(deps.profiles));

  return app;
}
