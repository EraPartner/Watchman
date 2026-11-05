import type { FastifyPluginAsync } from 'fastify';
import type { ListInstances } from '../../../application/ListInstances.js';

export function instancesRoutes(listInstances: ListInstances): FastifyPluginAsync {
  return (app) => {
    app.get('/instances', () => Promise.resolve({ data: listInstances.all() }));
    app.get<{ Params: { kind: string } }>('/instances/:kind', (req) => Promise.resolve({ data: listInstances.byKind(req.params.kind) }));
    app.get('/kinds', () => Promise.resolve({ data: listInstances.kinds() }));
    return Promise.resolve();
  };
}
