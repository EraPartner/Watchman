import { Agent } from 'undici';

export interface AgentPoolOptions {
  connections?: number;
  pipelining?: number;
  keepAliveTimeout?: number;
  keepAliveMaxTimeout?: number;
}

export function createAgentPool(opts: AgentPoolOptions = {}): Agent {
  return new Agent({
    connections: opts.connections ?? 32,
    pipelining: opts.pipelining ?? 1,
    keepAliveTimeout: opts.keepAliveTimeout ?? 10_000,
    keepAliveMaxTimeout: opts.keepAliveMaxTimeout ?? 60_000,
  });
}
