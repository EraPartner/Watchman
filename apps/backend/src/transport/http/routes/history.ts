import type { FastifyPluginAsync } from 'fastify';
import type { GetServiceHistory } from '../../../application/GetServiceHistory.js';
import type { Resolution, Aggregation } from '../../../infra/timeseries/TimeSeriesReader.js';

export interface HistoryRouteDeps {
  getHistory: GetServiceHistory;
}

const RESOLUTIONS: readonly Resolution[] = ['raw', '1m', '5m', '1h'] as const;
const AGGREGATIONS: readonly Aggregation[] = ['avg', 'min', 'max', 'last'] as const;

interface HistoryQuery {
  instance?: string;
  metric?: string;
  from?: string;
  to?: string;
  resolution?: string;
  agg?: string;
  limit?: string;
}

const parseDate = (v: string | undefined): Date | null => {
  if (!v) return null;
  const ms = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
};

export function historyRoutes(deps: HistoryRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { kind: string }; Querystring: HistoryQuery }>(
      '/services/:kind/history',
      async (req, reply) => {
        const q = req.query;
        if (!q.metric) {
          return reply.status(400).send({ error: { code: 'VALIDATION', message: 'metric required' } });
        }
        const from = parseDate(q.from);
        const to = parseDate(q.to);
        if (!from) return reply.status(400).send({ error: { code: 'VALIDATION', message: 'invalid or missing from' } });
        if (!to) return reply.status(400).send({ error: { code: 'VALIDATION', message: 'invalid or missing to' } });

        let resolution: Resolution | undefined;
        if (q.resolution !== undefined) {
          if (!RESOLUTIONS.includes(q.resolution as Resolution)) {
            return reply.status(400).send({ error: { code: 'VALIDATION', message: 'invalid resolution' } });
          }
          resolution = q.resolution as Resolution;
        }

        let agg: Aggregation | undefined;
        if (q.agg !== undefined) {
          if (!AGGREGATIONS.includes(q.agg as Aggregation)) {
            return reply.status(400).send({ error: { code: 'VALIDATION', message: 'invalid agg' } });
          }
          agg = q.agg as Aggregation;
        }

        let limit: number | undefined;
        if (q.limit !== undefined) {
          const n = Number(q.limit);
          if (!Number.isFinite(n) || n <= 0) {
            return reply.status(400).send({ error: { code: 'VALIDATION', message: 'invalid limit' } });
          }
          limit = n;
        }

        const result = await deps.getHistory.run({
          kind: req.params.kind,
          instance: q.instance,
          metric: q.metric,
          from,
          to,
          resolution,
          agg,
          limit,
        });

        if (!result.ok) {
          return reply
            .status(result.error.httpStatus)
            .send({ error: { code: result.error.code, message: result.error.message } });
        }
        return { data: result.value };
      },
    );
  };
}
