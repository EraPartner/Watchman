import type { Logger } from 'pino';
import type { ConfigStore } from './ConfigStore.js';
import { loadServicesConfigFromEnv } from '../loadServices.js';

export interface EnvMigrationResult {
  migrated: number;
  skipped: number;
}

export async function migrateEnvServicesIfNeeded(
  store: ConfigStore,
  logger: Logger,
  source: NodeJS.ProcessEnv = process.env,
): Promise<EnvMigrationResult> {
  const existing = await store.loadAll();
  if (existing.length > 0) {
    if (source['WATCHMAN_SERVICES_CONFIG']) {
      logger.warn(
        'WATCHMAN_SERVICES_CONFIG set but DB already has services. Env var ignored — remove it.',
      );
    }
    return { migrated: 0, skipped: 0 };
  }

  let cfg;
  try {
    cfg = loadServicesConfigFromEnv(source);
  } catch (err) {
    logger.error({ err }, 'env migration: failed to parse WATCHMAN_SERVICES_CONFIG');
    return { migrated: 0, skipped: 0 };
  }
  if (cfg.instances.length === 0) {
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  let skipped = 0;
  for (const inst of cfg.instances) {
    try {
      await store.create(inst, 'env-migration');
      migrated += 1;
    } catch (err) {
      skipped += 1;
      logger.error(
        { err, kind: inst.kind, instanceId: inst.instanceId },
        'env migration: failed to import instance',
      );
    }
  }

  await store.writeAudit({
    action: 'import',
    targetKind: null,
    targetId: null,
    diff: { migrated, skipped, source: 'env' },
    actor: 'env-migration',
  });

  logger.info(
    { migrated, skipped },
    `Migrated ${migrated} services from env. Remove WATCHMAN_SERVICES_CONFIG and per-kind service env vars.`,
  );
  return { migrated, skipped };
}
