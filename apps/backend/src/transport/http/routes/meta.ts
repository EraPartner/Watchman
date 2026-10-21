import type { FastifyPluginAsync } from 'fastify';
import { SERVER_VERSION } from '../../../version.js';

export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/meta/health', async () => ({
    ok: true,
    service: 'watchman-backend-v2',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  // Not npm_package_version: it is only set under npm scripts, so the desktop
  // app and `node dist/index.js` reported "dev".
  app.get('/meta/version', async () => ({
    version: SERVER_VERSION,
    node: process.version,
  }));
};
