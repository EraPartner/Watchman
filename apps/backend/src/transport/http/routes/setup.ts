import type { FastifyPluginAsync } from 'fastify';
import type { ConfigStore } from '../../../config/store/ConfigStore.js';
import type { HttpClient } from '../../../infra/http/client.js';
import { createPinnedClient, probeCertFingerprint } from '../../../infra/http/pinnedClient.js';
import { pairBridge } from '../../../domain/services/philipsBridge/huePairing.js';
import { ValidationError, UnavailableError } from '../../../core/errors.js';
import { z } from 'zod';

const DEFAULT_PAIR_TIMEOUT_MS = 10_000;
// The route runs a cert probe and the pair request, each with this timeout, and
// the UI gives up after 25 s, so 2 x the cap must stay under that.
export const MAX_PAIR_TIMEOUT_MS = 12_000;

// A bare hostname, IPv4 or bracketed IPv6 literal: the route builds
// `https://${host}/api` and probes `${host}:443`, so a scheme, port, path or
// credentials would produce a different request than the user asked for.
function isBareHost(host: string): boolean {
  if (/[\s/\\?#@]/.test(host)) return false;
  try {
    const url = new URL(`https://${host}`);
    return url.hostname.length > 0 && url.port === '' && url.host === host.toLowerCase();
  } catch {
    return false;
  }
}

export const pairBodySchema = z.object({
  host: z
    .string({ error: 'host is required' })
    .trim()
    .min(1, 'host is required')
    .refine(isBareHost, 'host must be an IP address or hostname, without scheme, port or path'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(MAX_PAIR_TIMEOUT_MS)
    .default(DEFAULT_PAIR_TIMEOUT_MS),
});

export function parsePairBody(
  body: unknown,
): { ok: true; host: string; timeoutMs: number } | { ok: false; message: string } {
  const parsed = pairBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.');
    const message = issue?.message ?? 'invalid request body';
    return { ok: false, message: field && !message.startsWith(field) ? `${field}: ${message}` : message };
  }
  return { ok: true, ...parsed.data };
}

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
        const body = parsePairBody(req.body);
        if (!body.ok) {
          return reply.status(400).send({ error: { code: 'VALIDATION', message: body.message } });
        }
        const { host, timeoutMs } = body;

        try {
          const result = await pairBridge(
            host,
            {
              http: deps.http,
              probeCertHash: probeCertFingerprint,
              httpForCert: createPinnedClient,
            },
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
