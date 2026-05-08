import type { FastifyPluginAsync } from 'fastify';
import type { ConfigStore } from '../../../config/store/ConfigStore.js';
import type { HttpClient } from '../../../infra/http/client.js';
import { probeCertFingerprint } from '../../../infra/http/pinnedClient.js';
import { pairBridge } from '../../../domain/services/philipsBridge/huePairing.js';
import { ValidationError, UnavailableError } from '../../../core/errors.js';

export interface SetupRouteDeps {
  store: ConfigStore;
  http: HttpClient;
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

    app.post<{ Body: { host?: unknown; timeoutMs?: unknown } }>(
      '/setup/philips-bridge/pair',
      async (req, reply) => {
        const host = req.body?.host;
        if (typeof host !== 'string' || host.length === 0) {
          return reply
            .status(400)
            .send({ error: { code: 'VALIDATION', message: 'host is required' } });
        }

        const timeoutMs =
          typeof req.body?.timeoutMs === 'number' && req.body.timeoutMs > 0
            ? req.body.timeoutMs
            : 10_000;

        try {
          const result = await pairBridge(
            host,
            { http: deps.http, probeCertHash: probeCertFingerprint },
            timeoutMs,
          );
          return { data: result };
        } catch (err) {
          if (err instanceof ValidationError) {
            return reply
              .status(400)
              .send({ error: { code: 'LINK_BUTTON_NOT_PRESSED', message: err.message } });
          }
          if (err instanceof UnavailableError) {
            return reply
              .status(503)
              .send({ error: { code: 'UNAVAILABLE', message: err.message } });
          }
          throw err;
        }
      },
    );
  };
}
