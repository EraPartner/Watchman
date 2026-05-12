import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDuckDbPool, type DuckDbPool } from '../../infra/db/DuckDbPool.js';
import { createEventBus, type EventMap } from '../../core/eventBus.js';
import { ValidationError } from '../../core/errors.js';
import { createEncryptor, deriveKey } from './encryption.js';
import { runConfigMigrations } from './migrations.js';
import { createConfigStore, type ConfigStore } from './ConfigStore.js';

describe('ConfigStore', () => {
  let pool: DuckDbPool;
  let store: ConfigStore;
  let renamedEvents: EventMap['config:service.renamed'][];
  let updatedEvents: EventMap['config:service.updated'][];

  beforeEach(async () => {
    pool = await createDuckDbPool({ path: ':memory:' });
    const conn = await pool.connect();
    await runConfigMigrations(conn);
    const encryptor = createEncryptor(deriveKey('unit-test-key'));
    const bus = createEventBus();
    renamedEvents = [];
    updatedEvents = [];
    bus.on('config:service.renamed', (p) => renamedEvents.push(p));
    bus.on('config:service.updated', (p) => updatedEvents.push(p));
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
    ).rejects.toThrow(/already in use/);
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

  describe('instance id rename', () => {
    it('renames an instance: persists, writes rename audit, emits renamed event', async () => {
      const created = await store.create({
        kind: 'ipfs',
        instanceId: 'old',
        apiUrl: 'http://127.0.0.1:5001',
      });
      renamedEvents.length = 0;
      updatedEvents.length = 0;

      const renamed = await store.update(
        created.id,
        { kind: 'ipfs', instanceId: 'new', apiUrl: 'http://127.0.0.1:5001' },
        'tester',
      );

      expect(renamed.instanceId).toBe('new');
      const reloaded = await store.get(created.id);
      expect(reloaded?.instanceId).toBe('new');

      const audit = await store.listAudit();
      const renameRow = audit.find((a) => a.action === 'rename');
      expect(renameRow).toBeDefined();
      expect(renameRow!.targetId).toBe(created.id);
      expect(renameRow!.targetKind).toBe('ipfs');
      expect(renameRow!.diff).toEqual({ from: 'old', to: 'new' });
      expect(renameRow!.actor).toBe('tester');

      expect(renamedEvents).toEqual([
        {
          id: created.id,
          kind: 'ipfs',
          oldInstanceId: 'old',
          newInstanceId: 'new',
        },
      ]);
      expect(updatedEvents).toHaveLength(1);
    });

    it('does not emit renamed event when instanceId unchanged', async () => {
      const created = await store.create({
        kind: 'ipfs',
        instanceId: 'main',
        apiUrl: 'http://127.0.0.1:5001',
      });
      renamedEvents.length = 0;

      await store.update(created.id, {
        kind: 'ipfs',
        instanceId: 'main',
        apiUrl: 'http://127.0.0.1:5002',
      });

      expect(renamedEvents).toHaveLength(0);
      const audit = await store.listAudit();
      expect(audit.some((a) => a.action === 'rename')).toBe(false);
    });

    it('rejects rename when target id already in use for same kind', async () => {
      const a = await store.create({
        kind: 'ipfs',
        instanceId: 'a',
        apiUrl: 'http://127.0.0.1:5001',
      });
      await store.create({
        kind: 'ipfs',
        instanceId: 'b',
        apiUrl: 'http://127.0.0.1:5002',
      });

      await expect(
        store.update(a.id, {
          kind: 'ipfs',
          instanceId: 'b',
          apiUrl: 'http://127.0.0.1:5001',
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      const reloaded = await store.get(a.id);
      expect(reloaded?.instanceId).toBe('a');
    });

    it('allows the same instance id across different kinds', async () => {
      const a = await store.create({
        kind: 'ipfs',
        instanceId: 'shared',
        apiUrl: 'http://127.0.0.1:5001',
      });
      await store.create({
        kind: 'bitcoin',
        instanceId: 'main',
        rpcUrl: 'http://127.0.0.1:8332',
        rpcUser: 'u',
        rpcPassword: 'p',
      });

      // Renaming bitcoin/main → bitcoin/shared should be fine even though
      // ipfs/shared already exists.
      const all = await store.loadAll();
      const btc = all.find((s) => s.kind === 'bitcoin')!;
      const renamed = await store.update(btc.id, {
        kind: 'bitcoin',
        instanceId: 'shared',
        rpcUrl: 'http://127.0.0.1:8332',
        rpcUser: 'u',
        rpcPassword: '***',
      });

      expect(renamed.instanceId).toBe('shared');
      expect(a.instanceId).toBe('shared');
    });

    it('rejects invalid instance id (uppercase) on update', async () => {
      const created = await store.create({
        kind: 'ipfs',
        instanceId: 'good',
        apiUrl: 'http://127.0.0.1:5001',
      });

      await expect(
        store.update(created.id, {
          kind: 'ipfs',
          instanceId: 'BadID',
          apiUrl: 'http://127.0.0.1:5001',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects invalid instance id (leading dash) on update', async () => {
      const created = await store.create({
        kind: 'ipfs',
        instanceId: 'good',
        apiUrl: 'http://127.0.0.1:5001',
      });

      await expect(
        store.update(created.id, {
          kind: 'ipfs',
          instanceId: '-leading',
          apiUrl: 'http://127.0.0.1:5001',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects invalid instance id on create (uppercase)', async () => {
      await expect(
        store.create({
          kind: 'ipfs',
          instanceId: 'BadID',
          apiUrl: 'http://127.0.0.1:5001',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
