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
import { hostname } from "node:os";
import {
  createOriginPolicy,
  createHostPolicy,
  type OriginPredicate,
  type HostPredicate,
} from "../originPolicy.js";

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
  isHostAllowed?: HostPredicate | undefined;
}

// True when the request's Origin denotes the same host:port as its Host header,
// i.e. a genuine same-origin request (never cross-site regardless of the CORS
// allow-list). `URL.host` includes a non-default port, matching the Host header.
function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export async function buildServer(deps: BuildServerDeps) {
  const app = Fastify({
    loggerInstance: deps.logger,
    disableRequestLogging: false,
    trustProxy: deps.trustProxy ?? false,
    bodyLimit: 1 * 1024 * 1024,
  });

  const isOriginAllowed = deps.isOriginAllowed ?? createOriginPolicy();
  const isHostAllowed = deps.isHostAllowed ?? createHostPolicy([], hostname());

  app.addHook("onRequest", async (request, reply) => {
    // DNS-rebinding guard (see createHostPolicy): reject unrecognised Host
    // headers before doing anything else. This closes the same-origin rebind
    // path that the Origin check below cannot see.
    const host = request.headers.host;
    if (!isHostAllowed(host)) {
      request.log.warn(
        { host },
        "rejected request with disallowed Host header (possible DNS rebinding)"
      );
      return reply.code(403).send();
    }

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
      } else if (!isSameOrigin(origin, host)) {
        // Disallowed AND cross-origin: reject outright, not just the preflight.
        // Previously a non-OPTIONS cross-origin request fell through and executed
        // (the browser was merely blocked from reading the response), so a
        // malicious page could still drive state changes on this no-auth API.
        // A genuine same-origin request (Origin host === Host) is allowed even
        // when the origin isn't on the CORS list — that can't be cross-site, and
        // the Host guard above has already rejected rebinding — so this never
        // 403s a legitimate same-origin write on a LAN (0.0.0.0) deployment.
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
