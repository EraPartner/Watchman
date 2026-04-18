import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { isDomainError, DomainError } from '../../../core/errors.js';

interface ErrorBody {
  error: { code: string; message: string };
}

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    if (isDomainError(err)) {
      const body: ErrorBody = { error: { code: err.code, message: err.message } };
      return reply.status(err.httpStatus).send(body);
    }
    const fastifyErr = err as { statusCode?: number; message?: string; validation?: unknown };
    if (fastifyErr.validation) {
      return reply.status(400).send({ error: { code: 'VALIDATION', message: fastifyErr.message ?? 'invalid request' } });
    }
    const status = fastifyErr.statusCode && fastifyErr.statusCode >= 400 ? fastifyErr.statusCode : 500;
    app.log.error({ err }, 'unhandled error');
    return reply.status(status).send({ error: { code: 'INTERNAL', message: status === 500 ? 'internal error' : (fastifyErr.message ?? 'error') } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'route not found' } });
  });
};

export const errorHandlerPlugin = fp(plugin, { name: 'errorHandler' });

export function toDomainErrorResult(err: DomainError): ErrorBody {
  return { error: { code: err.code, message: err.message } };
}
