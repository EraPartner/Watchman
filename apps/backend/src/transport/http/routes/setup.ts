import type { FastifyPluginAsync } from 'fastify';
import type { ConfigStore } from '../../../config/store/ConfigStore.js';

export interface SetupRouteDeps {
  store: ConfigStore;
}

export function setupRoutes(deps: SetupRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/setup/status', async () => {
      const services = await deps.store.loadAll();
      const needsSetup = services.length === 0;
      return {
        data: {
          needsSetup,
          serviceCount: services.length,
        },
      };
    });
  };
}
