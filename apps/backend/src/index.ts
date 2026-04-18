import { loadEnv } from './config/env.js';
import { loadServicesConfigFromEnv } from './config/loadServices.js';
import { createLogger } from './core/logger.js';
import { buildServer } from './transport/http/server.js';
import { registerShutdown } from './bootstrap/shutdown.js';
import { registerServices } from './bootstrap/registerServices.js';
import { GetServiceStatus } from './application/GetServiceStatus.js';
import { GetAggregatedHealth } from './application/GetAggregatedHealth.js';
import { ControlService } from './application/ControlService.js';
import { ListInstances } from './application/ListInstances.js';
import { createMetricsRegistry } from './core/metrics.js';
import { createEventBus } from './core/eventBus.js';
import { systemClock } from './core/clock.js';
import { createBackgroundPoller } from './infra/scheduler/poller.js';
import { createHttpClient } from './infra/http/client.js';
import { createPingProber } from './infra/net/pingProbe.js';
import { createTcpProber } from './infra/net/tcpProbe.js';
import { createSshExecutor } from './infra/ssh/sshExecutorImpl.js';
import { createSnmpGetter } from './infra/snmp/snmpGetterImpl.js';
import { createPigpioClient } from './infra/gpio/pigpioClientImpl.js';
import { wsPlugin } from './transport/ws/wsPlugin.js';

const SERVER_VERSION = '2.0.0';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);

  logger.info({ env: env.NODE_ENV, port: env.BACKEND_V2_PORT }, 'starting watchman backend v2');

  const servicesConfig = loadServicesConfigFromEnv();
  const bus = createEventBus((err) => logger.error({ err }, 'eventBus handler error'));
  const metrics = createMetricsRegistry();

  const infra = {
    http: createHttpClient(),
    ping: createPingProber(),
    tcp: createTcpProber(),
    ssh: createSshExecutor(),
    snmp: createSnmpGetter(),
    pigpio: createPigpioClient(),
    now: () => systemClock.now(),
  };

  const registry = registerServices(servicesConfig, infra);
  const poller = createBackgroundPoller({ clock: systemClock, bus, logger });

  for (const svc of registry.all()) {
    poller.track(svc);
    if (svc.onStart) {
      try { await svc.onStart(); } catch (err) { logger.error({ err, id: svc.id }, 'service onStart failed'); }
    }
  }
  metrics.setPollerStats({ snapshot: () => ({ tracked: registry.all().length }) });

  const app = await buildServer({
    logger,
    services: {
      getStatus: new GetServiceStatus({ registry }),
      aggregated: new GetAggregatedHealth(registry),
      control: new ControlService(registry),
    },
    listInstances: new ListInstances(registry),
    metrics,
  });

  await app.register(wsPlugin, {
    bus,
    logger,
    now: () => systemClock.now(),
    serverVersion: SERVER_VERSION,
  });

  registerShutdown({
    close: async () => {
      await poller.stop();
      for (const svc of registry.all()) {
        if (svc.onStop) {
          try { await svc.onStop(); } catch (err) { logger.error({ err, id: svc.id }, 'service onStop failed'); }
        }
      }
      await app.close();
    },
  }, logger);

  try {
    await app.listen({ port: env.BACKEND_V2_PORT, host: env.BACKEND_V2_HOST });
  } catch (err) {
    logger.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('fatal bootstrap error', err);
  process.exit(1);
});
