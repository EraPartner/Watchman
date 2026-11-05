import type { FastifyPluginAsync } from 'fastify';
import type { MetricsRegistry } from '../../../core/metrics.js';

export function metricsRoutes(registry: MetricsRegistry): FastifyPluginAsync {
  return (app) => {
    app.get('/metrics', () => Promise.resolve(registry.snapshot()));
    return Promise.resolve();
  };
}
