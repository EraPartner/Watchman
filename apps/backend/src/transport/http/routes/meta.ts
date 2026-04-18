import type { FastifyPluginAsync } from 'fastify';

export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/meta/health', async () => ({
    ok: true,
    service: 'watchman-backend-v2',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  app.get('/meta/version', async () => ({
    version: process.env.npm_package_version ?? 'dev',
    node: process.version,
  }));
};
