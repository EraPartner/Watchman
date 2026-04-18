import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export interface RequestTimeoutOptions {
  timeoutMs: number;
}

const plugin: FastifyPluginAsync<RequestTimeoutOptions> = async (app, opts) => {
  const { timeoutMs } = opts;
  app.addHook('onRequest', async (req, reply) => {
    const timer = setTimeout(() => {
      if (reply.sent) return;
      void reply.status(504).send({ error: { code: 'TIMEOUT', message: 'request timed out' } });
    }, timeoutMs);
    const clear = (): void => clearTimeout(timer);
    reply.raw.once('close', clear);
    reply.raw.once('finish', clear);
    req.raw.once('aborted', clear);
  });
};

export const requestTimeoutPlugin = fp(plugin, { name: 'requestTimeout' });
