import { loadEnv } from './config/env.js';
import { createLogger } from './core/logger.js';
import { buildServer } from './transport/http/server.js';
import { registerShutdown } from './bootstrap/shutdown.js';
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
import { mkdir } from 'node:fs/promises';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { createDuckDbPool } from './infra/timeseries/DuckDbPool.js';
import { runMigrations } from './infra/timeseries/migrations.js';
import { createTimeSeriesWriter } from './infra/timeseries/TimeSeriesWriter.js';
import { createTimeSeriesReader } from './infra/timeseries/TimeSeriesReader.js';
import { createRollupWorker } from './infra/timeseries/RollupWorker.js';
import { GetServiceHistory } from './application/GetServiceHistory.js';
import { ServiceRegistry } from './domain/ServiceRegistry.js';
import { loadEncryptorFromEnv } from './config/store/encryption.js';
import { runConfigMigrations } from './config/store/migrations.js';
import { createConfigStore } from './config/store/ConfigStore.js';
import { migrateEnvServicesIfNeeded } from './config/store/envMigrator.js';
import { createServiceLifecycle } from './application/ServiceLifecycle.js';

const SERVER_VERSION = '2.0.0';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);

  logger.info({ env: env.NODE_ENV, port: env.BACKEND_V2_PORT }, 'starting watchman backend v2');

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

  const dataDir = isAbsolute(env.DATA_DIR) ? env.DATA_DIR : resolve(process.cwd(), env.DATA_DIR);
  const dbPath = join(dataDir, 'watchman.duckdb');
  await mkdir(dirname(dbPath), { recursive: true });
  const dbPool = await createDuckDbPool({ path: dbPath });
  const migConn = await dbPool.connect();
  try {
    await runConfigMigrations(migConn);
    if (env.TIMESERIES_ENABLED) {
      await runMigrations(migConn);
    }
  } finally {
    try {
      migConn.closeSync();
    } catch {
      // ignore close errors
    }
  }

  const encryptor = loadEncryptorFromEnv(env.WATCHMAN_MASTER_KEY);
  const store = createConfigStore(dbPool, encryptor, bus);
  const migResult = await migrateEnvServicesIfNeeded(store, logger);
  if (migResult.migrated > 0) {
    logger.info({ migrated: migResult.migrated, skipped: migResult.skipped }, 'env migration complete');
  }

  const registry = new ServiceRegistry();
  const poller = createBackgroundPoller({ clock: systemClock, bus, logger });
  const lifecycle = createServiceLifecycle({ store, registry, poller, bus, infra, logger });
  await lifecycle.start();

  metrics.setPollerStats({ snapshot: () => ({ tracked: registry.all().length }) });

  let tsWriter: ReturnType<typeof createTimeSeriesWriter> | null = null;
  let tsRollup: ReturnType<typeof createRollupWorker> | null = null;
  let history: { getHistory: GetServiceHistory } | undefined;
  if (env.TIMESERIES_ENABLED) {
    tsWriter = createTimeSeriesWriter({ pool: dbPool, bus, clock: systemClock, logger });
    tsRollup = createRollupWorker({ pool: dbPool, clock: systemClock, logger });
    await tsWriter.start();
    await tsRollup.start();
    const reader = createTimeSeriesReader(dbPool);
    history = { getHistory: new GetServiceHistory({ registry, reader }) };
  }

  const adminConfigured = Boolean(env.AUTH_USERNAME && env.AUTH_PASSWORD_HASH);

  const app = await buildServer({
    logger,
    services: {
      getStatus: new GetServiceStatus({ registry }),
      aggregated: new GetAggregatedHealth(registry),
      control: new ControlService(registry),
    },
    history,
    listInstances: new ListInstances(registry),
    metrics,
    config: { store, lifecycle, registry },
    setup: { store, adminConfigured },
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
      await lifecycle.stop();
      if (tsRollup) await tsRollup.stop();
      if (tsWriter) await tsWriter.stop();
      await dbPool.close();
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
  console.error('fatal bootstrap error', err);
  process.exit(1);
});
