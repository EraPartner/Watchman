import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export interface LogSamplingOptions {
  healthSampleRate?: number;
  skipUserAgents?: readonly string[];
  healthPaths?: readonly string[];
}

const plugin: FastifyPluginAsync<LogSamplingOptions> = async (app, opts) => {
  const rate = Math.max(1, opts.healthSampleRate ?? 20);
  const skipUAs = (opts.skipUserAgents ?? ['ELB-HealthChecker', 'kube-probe', 'GoogleHC']).map((s) => s.toLowerCase());
  const healthPaths = opts.healthPaths ?? ['/meta/health'];
  let seen = 0;

  app.addHook('onRequest', async (req) => {
    const url = req.url.split('?')[0] ?? req.url;
    const ua = (req.headers['user-agent'] ?? '').toString().toLowerCase();
    const isHealth = healthPaths.includes(url);
    const isSkipUA = skipUAs.some((s) => ua.includes(s));
    if (isSkipUA || (isHealth && seen++ % rate !== 0)) {
      (req as unknown as { log: { level: string } }).log.level = 'silent';
    }
  });
};

export const logSamplingPlugin = fp(plugin, { name: 'logSampling' });
