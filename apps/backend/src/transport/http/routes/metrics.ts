import type { FastifyPluginAsync } from 'fastify';
import type { MetricsRegistry } from '../../../core/metrics.js';

export function metricsRoutes(registry: MetricsRegistry): FastifyPluginAsync {
  return async (app) => {
    app.get('/metrics', async () => registry.snapshot());
  };
}
