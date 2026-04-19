import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDuckDbPool, type DuckDbPool } from '../../infra/timeseries/DuckDbPool.js';
import { createEventBus } from '../../core/eventBus.js';
import { createEncryptor, deriveKey } from './encryption.js';
import { runConfigMigrations } from './migrations.js';
import { createConfigStore, type ConfigStore } from './ConfigStore.js';

describe('ConfigStore', () => {
  let pool: DuckDbPool;
  let store: ConfigStore;

  beforeEach(async () => {
    pool = await createDuckDbPool({ path: ':memory:' });
    const conn = await pool.connect();
    await runConfigMigrations(conn);
    const encryptor = createEncryptor(deriveKey('unit-test-key'));
    const bus = createEventBus();
    store = createConfigStore(pool, encryptor, bus);
  });

  afterEach(async () => {
    await pool.close();
  });

  it('creates, reads, updates, deletes a qbittorrent instance', async () => {
    const created = await store.create({
      kind: 'qbittorrent',
      instanceId: 'main',
      baseUrl: 'http://127.0.0.1:8069',
      username: 'admin',
      password: 'supersecret',
    });

    expect(created.id).toBeTruthy();
    expect(created.kind).toBe('qbittorrent');

    const loaded = await store.get(created.id);
    expect(loaded).not.toBeNull();
    expect((loaded!.config as { password: string }).password).toBe('supersecret');

    const redacted = store.redact(loaded!);
    expect((redacted.config as { password: string }).password).toBe('***');

    const updated = await store.update(created.id, {
      kind: 'qbittorrent',
      instanceId: 'main',
      baseUrl: 'http://10.0.0.1:8069',
      username: 'admin',
      password: '***',
    });
    expect((updated.config as { baseUrl: string }).baseUrl).toBe('http://10.0.0.1:8069');
    expect((updated.config as { password: string }).password).toBe('supersecret');

    await store.delete(created.id);
    expect(await store.get(created.id)).toBeNull();
  });

  it('prevents duplicate kind+instanceId', async () => {
    await store.create({
      kind: 'ipfs',
      instanceId: 'one',
      apiUrl: 'http://127.0.0.1:5001',
    });
    await expect(
      store.create({
        kind: 'ipfs',
        instanceId: 'one',
        apiUrl: 'http://127.0.0.1:5002',
      }),
    ).rejects.toThrow(/exists/);
  });

  it('persists a service without secret fields', async () => {
    const created = await store.create({
      kind: 'ipfs',
      instanceId: 'main',
      apiUrl: 'http://127.0.0.1:5001',
    });
    const loaded = await store.get(created.id);
    expect(loaded!.config.kind).toBe('ipfs');
  });

  it('writes audit rows and lists them newest first', async () => {
    const a = await store.create({ kind: 'ipfs', instanceId: 'a', apiUrl: 'http://127.0.0.1:5001' });
    await store.update(a.id, { kind: 'ipfs', instanceId: 'a', apiUrl: 'http://127.0.0.1:5002' });
    await store.delete(a.id);
    const audit = await store.listAudit();
    expect(audit.length).toBeGreaterThanOrEqual(3);
    expect(audit[0]!.action).toBe('delete');
  });

  it('loadAll returns all instances', async () => {
    await store.create({ kind: 'ipfs', instanceId: 'a', apiUrl: 'http://127.0.0.1:5001' });
    await store.create({ kind: 'bitcoin', instanceId: 'main', rpcUrl: 'http://127.0.0.1:8332', rpcUser: 'u', rpcPassword: 'p' });
    const all = await store.loadAll();
    expect(all.length).toBe(2);
  });
});
