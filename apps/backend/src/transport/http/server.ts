import Fastify from 'fastify';
import compress from '@fastify/compress';
import type { Logger } from 'pino';
import { metaRoutes } from './routes/meta.js';
import { servicesRoutes, type ServicesRouteDeps } from './routes/services.js';
import { instancesRoutes } from './routes/instances.js';
import { metricsRoutes } from './routes/metrics.js';
import { historyRoutes, type HistoryRouteDeps } from './routes/history.js';
import { configRoutes, type ConfigRouteDeps } from './routes/config.js';
import { setupRoutes, type SetupRouteDeps } from './routes/setup.js';
import { errorHandlerPlugin } from './plugins/errorHandler.js';
import { requestTimeoutPlugin } from './plugins/requestTimeout.js';
import { logSamplingPlugin } from './plugins/logSampling.js';
import type { ListInstances } from '../../application/ListInstances.js';
import type { MetricsRegistry } from '../../core/metrics.js';

export interface BuildServerDeps {
  logger: Logger;
  services: ServicesRouteDeps;
  history?: HistoryRouteDeps | undefined;
  listInstances: ListInstances;
  metrics: MetricsRegistry;
  config: ConfigRouteDeps;
  setup: SetupRouteDeps;
  requestTimeoutMs?: number | undefined;
  healthLogSampleRate?: number | undefined;
}

export async function buildServer(deps: BuildServerDeps) {
  const app = Fastify({
    logger: deps.logger,
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
  });

  await app.register(logSamplingPlugin, { healthSampleRate: deps.healthLogSampleRate ?? 20 });
  await app.register(requestTimeoutPlugin, { timeoutMs: deps.requestTimeoutMs ?? 15_000 });
  await app.register(compress, { global: true, threshold: 1024, encodings: ['br', 'gzip'] });
  await app.register(errorHandlerPlugin);
  await app.register(metaRoutes);
  await app.register(metricsRoutes(deps.metrics));
  await app.register(servicesRoutes(deps.services));
  if (deps.history) {
    await app.register(historyRoutes(deps.history));
  }
  await app.register(instancesRoutes(deps.listInstances));
  await app.register(setupRoutes(deps.setup));
  await app.register(configRoutes(deps.config));

  return app;
}
