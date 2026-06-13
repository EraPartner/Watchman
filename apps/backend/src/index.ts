import "dotenv/config";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./core/logger.js";
import { buildServer } from "./transport/http/server.js";
import { registerShutdown } from "./bootstrap/shutdown.js";
import { GetServiceStatus } from "./application/GetServiceStatus.js";
import { GetAggregatedHealth } from "./application/GetAggregatedHealth.js";
import { ControlService } from "./application/ControlService.js";
import { ListInstances } from "./application/ListInstances.js";
import { createMetricsRegistry } from "./core/metrics.js";
import { createEventBus } from "./core/eventBus.js";
import { systemClock } from "./core/clock.js";
import { createBackgroundPoller } from "./infra/scheduler/poller.js";
import { createHttpClient } from "./infra/http/client.js";
import { createInsecureHttpClient } from "./infra/http/insecureClient.js";
import { createPingProber } from "./infra/net/pingProbe.js";
import { createTcpProber } from "./infra/net/tcpProbe.js";
import { createSshPool } from "./infra/ssh/sshPool.js";
import { createSnmpGetter } from "./infra/snmp/snmpGetterImpl.js";
import { createPigpioClient } from "./infra/gpio/pigpioClientImpl.js";
import { createTorControlClient } from "./infra/tor/controlClient.js";
import { roonConnect } from "./infra/roon/roonClientImpl.js";
import { zmqConnect } from "./infra/zmq/zmqSubscriberImpl.js";
import { wsPlugin } from "./transport/ws/wsPlugin.js";
import {
  createOriginPolicy,
  parseOriginList,
} from "./transport/originPolicy.js";
import { mkdir } from "node:fs/promises";
import { dirname, join, isAbsolute, resolve } from "node:path";
import { createDuckDbPool } from "./infra/db/DuckDbPool.js";
import { ServiceRegistry } from "./domain/ServiceRegistry.js";
import { loadEncryptorFromEnv } from "./config/store/encryption.js";
import { loadOrCreateMasterKey } from "./config/masterKey.js";
import { runConfigMigrations } from "./config/store/migrations.js";
import { createConfigStore } from "./config/store/ConfigStore.js";
import { createProfileStore } from "./config/store/ProfileStore.js";
import { migrateEnvServicesIfNeeded } from "./config/store/envMigrator.js";
import {
  createServiceLifecycle,
  type ServiceInstrumentation,
} from "./application/ServiceLifecycle.js";
import { createNetworkWatcher } from "./application/NetworkWatcher.js";
import {
  createArpLookup,
  defaultNeighborRunner,
} from "./infra/net/arpLookup.js";
import { createNetworkDetector } from "./infra/net/gatewayDetect.js";
import { SnapshotCache } from "./application/SnapshotCache.js";
import {
  createBreaker,
  type BreakerPolicy,
} from "./infra/circuitBreaker/breaker.js";
import { withBreakers } from "./infra/circuitBreaker/guardedService.js";

const SERVER_VERSION = "2.0.0";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);

  logger.info(
    { env: env.NODE_ENV, port: env.BACKEND_V2_PORT },
    "starting watchman backend v2"
  );

  const bus = createEventBus((err) =>
    logger.error({ err }, "eventBus handler error")
  );
  const metrics = createMetricsRegistry();

  const sshPool = createSshPool();
  const infra = {
    http: createHttpClient(),
    insecureHttp: createInsecureHttpClient(),
    ping: createPingProber(),
    tcp: createTcpProber(),
    ssh: sshPool,
    snmp: createSnmpGetter(),
    pigpio: createPigpioClient(),
    torControl: createTorControlClient(),
    roonConnect,
    zmqConnect,
    now: () => systemClock.now(),
  };

  const dataDir = isAbsolute(env.DATA_DIR)
    ? env.DATA_DIR
    : resolve(process.cwd(), env.DATA_DIR);
  const dbPath = join(dataDir, "watchman.duckdb");
  await mkdir(dirname(dbPath), { recursive: true });
  const dbPool = await createDuckDbPool({ path: dbPath });
  await dbPool.withConnection((c) => runConfigMigrations(c));

  // Profiles (ADR-027): ensure a Default profile exists and is active, and that
  // every pre-existing service instance is assigned to it, before anything reads
  // the active profile or migrates env services into it.
  const profileStore = createProfileStore(dbPool, logger);
  await profileStore.ensureBootstrap(logger);

  const masterKey = loadOrCreateMasterKey(dataDir, env.WATCHMAN_MASTER_KEY);
  const encryptor = loadEncryptorFromEnv(masterKey);
  const store = createConfigStore(dbPool, encryptor, bus, logger, {
    resolveDefaultProfileId: () => profileStore.getActiveProfileId(),
  });
  const migResult = await migrateEnvServicesIfNeeded(store, logger);
  if (migResult.migrated > 0) {
    logger.info(
      { migrated: migResult.migrated, skipped: migResult.skipped },
      "env migration complete"
    );
  }

  const registry = new ServiceRegistry();
  const poller = createBackgroundPoller({ clock: systemClock, bus, logger });

  const snapshots = new SnapshotCache({ bus, clock: systemClock, metrics });
  snapshots.start();

  const breakerPolicy: BreakerPolicy = {
    failureThreshold: 5,
    resetAfterMs: 60_000,
    halfOpenMaxCalls: 1,
  };
  const instrument: ServiceInstrumentation = {
    wrap(svc, stored) {
      const health = createBreaker(
        `${svc.id}:health`,
        breakerPolicy,
        systemClock
      );
      const stats = createBreaker(
        `${svc.id}:stats`,
        breakerPolicy,
        systemClock
      );
      metrics.registerBreaker(health);
      metrics.registerBreaker(stats);
      const guarded = withBreakers(svc, { health, stats });
      snapshots.register(guarded, stored.config.cacheTtlMs);
      return guarded;
    },
    release(svcId) {
      metrics.removeBreaker(`${svcId}:health`);
      metrics.removeBreaker(`${svcId}:stats`);
      snapshots.unregister(svcId);
    },
  };

  const lifecycle = createServiceLifecycle({
    store,
    profiles: profileStore,
    registry,
    poller,
    bus,
    infra,
    logger,
    instrument,
  });

  // LAN auto-switch (ADR-027): detect the default gateway, ARP-resolve its MAC,
  // and switch the active profile when the network changes to a recognized one.
  const networkDetector = createNetworkDetector({
    arp: createArpLookup({ runner: defaultNeighborRunner }),
  });
  const networkWatcher = createNetworkWatcher({
    detector: networkDetector,
    profiles: profileStore,
    lifecycle,
    bus,
    logger,
  });

  metrics.setPollerStats({
    snapshot: () => ({ tracked: registry.all().length }),
  });
  bus.on("service.error", (p) => metrics.recordServiceError(p.id));

  const isOriginAllowed = createOriginPolicy(
    parseOriginList(env.CORS_ALLOWED_ORIGINS)
  );

  const app = await buildServer({
    logger,
    services: {
      getStatus: new GetServiceStatus({ registry, snapshots }),
      aggregated: new GetAggregatedHealth(registry, snapshots),
      control: new ControlService(registry),
    },
    listInstances: new ListInstances(registry),
    metrics,
    config: { store, lifecycle, registry },
    profiles: {
      profiles: profileStore,
      store,
      lifecycle,
      detector: networkDetector,
    },
    setup: { store, http: infra.http },
    trustProxy: env.TRUST_PROXY,
    isOriginAllowed,
  });

  await app.register(wsPlugin, {
    bus,
    logger,
    now: () => systemClock.now(),
    serverVersion: SERVER_VERSION,
    isOriginAllowed,
  });

  registerShutdown(
    {
      close: async () => {
        await networkWatcher.stop();
        await poller.stop();
        await lifecycle.stop();
        snapshots.stop();
        await dbPool.close();
        await app.close();
      },
    },
    logger
  );

  // Listen before service bring-up so the API (and its health probe) is
  // reachable even while a slow service onStart is still connecting.
  try {
    await app.listen({ port: env.BACKEND_V2_PORT, host: env.BACKEND_V2_HOST });
  } catch (err) {
    logger.error({ err }, "failed to start server");
    process.exit(1);
  }

  await lifecycle.start();
  logger.info({ tracked: registry.all().length }, "service bring-up complete");

  // Begin watching for LAN changes after the initial bring-up.
  networkWatcher.start();
}

main().catch((err: unknown) => {
  console.error("fatal bootstrap error", err);
  process.exit(1);
});
