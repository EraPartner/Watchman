import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { Clock } from './clock.js';
import type { EventBus } from './eventBus.js';
import type { HttpClient } from '../infra/http/client.js';
import type { Poller } from '../infra/scheduler/poller.js';
import type { ServiceRegistry } from '../domain/ServiceRegistry.js';

export interface Container {
  env: Env;
  logger: Logger;
  clock: Clock;
  bus: EventBus;
  http: HttpClient;
  poller: Poller;
  registry: ServiceRegistry;
}
