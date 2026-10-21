import { describe, it, expect, vi } from 'vitest';
import { pino } from 'pino';
import { migrateEnvServicesIfNeeded } from './envMigrator.js';
import type { ConfigStore } from './ConfigStore.js';

const silentLogger = pino({ level: 'silent' });
const ENV = {
  WATCHMAN_SERVICES_CONFIG: JSON.stringify({
    instances: [{ kind: 'ipfs', instanceId: 'main' }],
  }),
};

function fakeStore(opts: { services?: unknown[]; errors?: unknown[] } = {}) {
  const store = {
    loadAll: vi.fn().mockResolvedValue(opts.services ?? []),
    loadErrors: vi.fn().mockResolvedValue(opts.errors ?? []),
    create: vi.fn().mockResolvedValue({}),
    writeAudit: vi.fn().mockResolvedValue(undefined),
  };
  return { store, asStore: store as unknown as ConfigStore };
}

describe('migrateEnvServicesIfNeeded', () => {
  it('imports env instances into an empty store and audits it', async () => {
    const { store, asStore } = fakeStore();
    const res = await migrateEnvServicesIfNeeded(asStore, silentLogger, ENV);
    expect(res).toEqual({ migrated: 1, skipped: 0 });
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ipfs', instanceId: 'main' }),
      'env-migration',
    );
    expect(store.writeAudit).toHaveBeenCalledTimes(1);
  });

  it('skips when the store already has services', async () => {
    const { store, asStore } = fakeStore({ services: [{ id: 'a' }] });
    const res = await migrateEnvServicesIfNeeded(asStore, silentLogger, ENV);
    expect(res).toEqual({ migrated: 0, skipped: 0 });
    expect(store.create).not.toHaveBeenCalled();
  });

  // Regression: a store whose rows all fail to load (e.g. wrong master key)
  // was treated as empty, so the legacy env config was imported again.
  it('skips when the store only has rows that fail to load', async () => {
    const { store, asStore } = fakeStore({
      errors: [{ id: 'a', kind: 'ipfs', instanceId: 'old', message: 'decrypt failed' }],
    });
    const res = await migrateEnvServicesIfNeeded(asStore, silentLogger, ENV);
    expect(res).toEqual({ migrated: 0, skipped: 0 });
    expect(store.create).not.toHaveBeenCalled();
    expect(store.writeAudit).not.toHaveBeenCalled();
  });

  it('counts a failed create as skipped', async () => {
    const { store, asStore } = fakeStore();
    store.create.mockRejectedValueOnce(new Error('dup'));
    const res = await migrateEnvServicesIfNeeded(asStore, silentLogger, ENV);
    expect(res).toEqual({ migrated: 0, skipped: 1 });
  });

  it('does nothing on invalid JSON', async () => {
    const { store, asStore } = fakeStore();
    const res = await migrateEnvServicesIfNeeded(asStore, silentLogger, {
      WATCHMAN_SERVICES_CONFIG: '{not json',
    });
    expect(res).toEqual({ migrated: 0, skipped: 0 });
    expect(store.create).not.toHaveBeenCalled();
  });
});
