import type { FastifyPluginAsync } from 'fastify';
import { SERVER_VERSION } from '../../../version.js';

export const metaRoutes: FastifyPluginAsync = (app) => {
  app.get('/meta/health', () => Promise.resolve({
    ok: true,
    service: 'watchman-backend-v2',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  // Not npm_package_version: it is only set under npm scripts, so the desktop
  // app and `node dist/index.js` reported "dev".
  app.get('/meta/version', () => Promise.resolve({
    version: SERVER_VERSION,
    node: process.version,
  }));
  return Promise.resolve();
};
