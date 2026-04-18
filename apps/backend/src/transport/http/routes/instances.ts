import type { FastifyPluginAsync } from 'fastify';
import type { ListInstances } from '../../../application/ListInstances.js';

export function instancesRoutes(listInstances: ListInstances): FastifyPluginAsync {
  return async (app) => {
    app.get('/instances', async () => ({ data: listInstances.all() }));
    app.get<{ Params: { kind: string } }>('/instances/:kind', async (req) => ({ data: listInstances.byKind(req.params.kind) }));
    app.get('/kinds', async () => ({ data: listInstances.kinds() }));
  };
}
