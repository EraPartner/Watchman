import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDuckDbPool,
  toTs,
  type DuckDbPool,
} from "../../infra/db/DuckDbPool.js";
import { createEventBus, type EventMap } from "../../core/eventBus.js";
import { ValidationError } from "../../core/errors.js";
import { createEncryptor, deriveKey } from "./encryption.js";
import { runConfigMigrations } from "./migrations.js";
import { createConfigStore, type ConfigStore } from "./ConfigStore.js";
import { createProfileStore } from "./ProfileStore.js";

describe("ConfigStore", () => {
  let pool: DuckDbPool;
  let store: ConfigStore;
  let renamedEvents: EventMap["config:service.renamed"][];
  let updatedEvents: EventMap["config:service.updated"][];

  beforeEach(async () => {
    pool = await createDuckDbPool({ path: ":memory:" });
    const conn = await pool.connect();
    await runConfigMigrations(conn);
    const encryptor = createEncryptor(deriveKey("unit-test-key"));
    const bus = createEventBus();
    renamedEvents = [];
    updatedEvents = [];
    bus.on("config:service.renamed", (p) => renamedEvents.push(p));
    bus.on("config:service.updated", (p) => updatedEvents.push(p));
    store = createConfigStore(pool, encryptor, bus);
  });

  afterEach(async () => {
    await pool.close();
  });

  it("creates, reads, updates, deletes a qbittorrent instance", async () => {
    const created = await store.create({
      kind: "qbittorrent",
      instanceId: "main",
      baseUrl: "http://127.0.0.1:8069",
      username: "admin",
      password: "supersecret",
    });

    expect(created.id).toBeTruthy();
    expect(created.kind).toBe("qbittorrent");

    const loaded = await store.get(created.id);
    expect(loaded).not.toBeNull();
    expect((loaded!.config as { password: string }).password).toBe(
      "supersecret"
    );

    const redacted = store.redact(loaded!);
    expect((redacted.config as { password: string }).password).toBe("***");

    const updated = await store.update(created.id, {
      kind: "qbittorrent",
      instanceId: "main",
      baseUrl: "http://10.0.0.1:8069",
      username: "admin",
      password: "***",
    });
    expect((updated.config as { baseUrl: string }).baseUrl).toBe(
      "http://10.0.0.1:8069"
    );
    expect((updated.config as { password: string }).password).toBe(
      "supersecret"
    );

    await store.delete(created.id);
    expect(await store.get(created.id)).toBeNull();
  });

  it("clears a saved secret when the update sends null, keeps it on blank", async () => {
    const created = await store.create({
      kind: "router",
      instanceId: "main",
      host: "192.168.1.1",
      snmpCommunity: "public",
    });

    // Blank still means "keep the saved secret".
    const kept = await store.update(created.id, {
      kind: "router",
      instanceId: "main",
      host: "192.168.1.1",
      snmpCommunity: "",
    });
    expect(
      (kept.config as { snmpCommunity?: string }).snmpCommunity
    ).toBe("public");

    // null means "remove it" so SNMP stats can be turned off again.
    const cleared = await store.update(created.id, {
      kind: "router",
      instanceId: "main",
      host: "192.168.1.1",
      snmpCommunity: null,
    });
    expect(
      (cleared.config as { snmpCommunity?: string }).snmpCommunity
    ).toBeUndefined();

    const reloaded = await store.get(created.id);
    expect(
      (reloaded!.config as { snmpCommunity?: string }).snmpCommunity
    ).toBeUndefined();
    expect(
      (store.redact(reloaded!).config as { snmpCommunity?: string })
        .snmpCommunity
    ).toBeUndefined();
  });

  it("prevents duplicate kind+instanceId", async () => {
    await store.create({
      kind: "ipfs",
      instanceId: "one",
      apiUrl: "http://127.0.0.1:5001",
    });
    await expect(
      store.create({
        kind: "ipfs",
        instanceId: "one",
        apiUrl: "http://127.0.0.1:5002",
      })
    ).rejects.toThrow(/already in use/);
  });

  it("preserves pollPolicy, cacheTtlMs and timeoutMs on partial update", async () => {
    const created = await store.create({
      kind: "ipfs",
      instanceId: "main",
      apiUrl: "http://127.0.0.1:5001",
      pollPolicy: { healthMs: 60_000, statsMs: 120_000, jitterRatio: 0.2 },
      cacheTtlMs: 42_000,
      timeoutMs: 9_000,
    });

    // editor-style partial update: only kind fields, no pollPolicy/ttl/timeout
    const updated = await store.update(created.id, {
      kind: "ipfs",
      instanceId: "main",
      apiUrl: "http://127.0.0.1:5002",
    });

    expect(updated.config.pollPolicy).toEqual({
      healthMs: 60_000,
      statsMs: 120_000,
      jitterRatio: 0.2,
    });
    expect(updated.config.cacheTtlMs).toBe(42_000);
    expect(updated.config.timeoutMs).toBe(9_000);

    const reloaded = await store.get(created.id);
    expect(reloaded!.config.pollPolicy.healthMs).toBe(60_000);
  });

  it("persists a service without secret fields", async () => {
    const created = await store.create({
      kind: "ipfs",
      instanceId: "main",
      apiUrl: "http://127.0.0.1:5001",
    });
    const loaded = await store.get(created.id);
    expect(loaded!.config.kind).toBe("ipfs");
  });

  it("writes audit rows and lists them newest first", async () => {
    const a = await store.create({
      kind: "ipfs",
      instanceId: "a",
      apiUrl: "http://127.0.0.1:5001",
    });
    await store.update(a.id, {
      kind: "ipfs",
      instanceId: "a",
      apiUrl: "http://127.0.0.1:5002",
    });
    await store.delete(a.id);
    const audit = await store.listAudit();
    expect(audit.length).toBeGreaterThanOrEqual(3);
    expect(audit[0]!.action).toBe("delete");
  });

  it("breaks audit ts ties by insertion order (newest id first)", async () => {
    const ts = toTs(new Date("2026-01-01T00:00:00Z"));
    await pool.withConnection(async (c) => {
      for (const action of ["update", "rename"]) {
        await c.run(
          `INSERT INTO app_config_audit (ts, action, target_kind, target_id, diff, actor)
           VALUES (?, ?, NULL, NULL, NULL, NULL)`,
          [ts, action]
        );
      }
    });
    const audit = await store.listAudit();
    expect(audit.map((e) => e.action)).toEqual(["rename", "update"]);
    // TIMESTAMP is read back as UTC regardless of the host time zone.
    expect(audit[0]!.ts.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("listAudit falls back to the default limit for a non-finite value", async () => {
    await store.create({
      kind: "ipfs",
      instanceId: "a",
      apiUrl: "http://127.0.0.1:5001",
    });
    await expect(store.listAudit(Number.NaN)).resolves.toHaveLength(1);
  });

  describe("export / import", () => {
    it("round-trips services, secrets included, and updates matching entries", async () => {
      const created = await store.create({
        kind: "qbittorrent",
        instanceId: "main",
        baseUrl: "http://127.0.0.1:8069",
        username: "admin",
        password: "supersecret",
      });
      const bundle = await store.exportAll("alice");
      expect(bundle.version).toBe(1);
      expect(bundle.payload).not.toContain("supersecret");

      await store.delete(created.id);
      const restored = await store.importBundle(bundle, "alice");
      expect(restored).toEqual({
        imported: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      });
      const [svc] = await store.loadAll();
      expect((svc!.config as { password: string }).password).toBe(
        "supersecret"
      );

      const again = await store.importBundle(bundle);
      expect(again.updated).toBe(1);
      expect(again.imported).toBe(0);
      expect(await store.loadAll()).toHaveLength(1);

      const actions = (await store.listAudit()).map((e) => e.action);
      expect(actions).toContain("export");
      expect(actions).toContain("import");
    });

    it("updates instead of failing when a bundle repeats a (kind, instanceId)", async () => {
      const encryptor = createEncryptor(deriveKey("unit-test-key"));
      const entry = (apiUrl: string) => ({
        kind: "ipfs",
        instanceId: "dup",
        enabled: true,
        config: { kind: "ipfs", instanceId: "dup", apiUrl },
      });
      const payload = encryptor
        .encryptJson([
          entry("http://127.0.0.1:5001"),
          entry("http://127.0.0.1:5002"),
        ])
        .toString("base64");

      const result = await store.importBundle({
        version: 1,
        exportedAt: new Date().toISOString(),
        payload,
      });

      expect(result.errors).toEqual([]);
      expect(result.imported).toBe(1);
      expect(result.updated).toBe(1);
      const all = await store.loadAll();
      expect(all).toHaveLength(1);
      expect((all[0]!.config as { apiUrl: string }).apiUrl).toBe(
        "http://127.0.0.1:5002"
      );
    });

    async function insertProfile(id: string): Promise<void> {
      const now = toTs(new Date());
      await pool.withConnection((c) =>
        c.run(
          `INSERT INTO app_profile (id, name, network_sigs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [id, id, "[]", now, now]
        )
      );
    }

    function bundleOf(entries: unknown[]) {
      const encryptor = createEncryptor(deriveKey("unit-test-key"));
      return {
        version: 1 as const,
        exportedAt: new Date().toISOString(),
        payload: encryptor.encryptJson(entries).toString("base64"),
      };
    }

    it("restores the exported profile when it exists, else falls back", async () => {
      await insertProfile("travel");
      const ipfs = (instanceId: string, profileId?: string) => ({
        kind: "ipfs",
        instanceId,
        enabled: true,
        ...(profileId === undefined ? {} : { profileId }),
        config: { kind: "ipfs", instanceId, apiUrl: "http://127.0.0.1:5001" },
      });

      const result = await store.importBundle(
        bundleOf([ipfs("a", "travel"), ipfs("b", "gone"), ipfs("c")])
      );

      expect(result.errors).toEqual([]);
      const byId = new Map(
        (await store.loadAll()).map((s) => [s.instanceId, s.profileId])
      );
      expect(byId.get("a")).toBe("travel");
      // No resolveDefaultProfileId in this store, so the fallback is unassigned.
      expect(byId.get("b")).toBe("");
      expect(byId.get("c")).toBe("");
    });

    it("exports profileId with each service", async () => {
      await insertProfile("home");
      await store.create(
        { kind: "ipfs", instanceId: "a", apiUrl: "http://127.0.0.1:5001" },
        undefined,
        "home"
      );
      const bundle = await store.exportAll();
      const encryptor = createEncryptor(deriveKey("unit-test-key"));
      const entries = encryptor.decryptJson<Array<{ profileId: string }>>(
        Buffer.from(bundle.payload, "base64")
      );
      expect(entries[0]!.profileId).toBe("home");
    });

    it("explains a conflict with an unloadable row and counts skipped rows on export", async () => {
      const now = toTs(new Date());
      await pool.withConnection((c) =>
        c.run(
          `INSERT INTO app_service_instance
            (id, kind, instance_id, enabled, config_public, config_secret, poll_policy, cache_ttl_ms, timeout_ms, created_at, updated_at)
           VALUES (?, 'adguard', 'broken', true, '{}', NULL, '{}', 10000, 5000, ?, ?)`,
          [randomUUID(), now, now]
        )
      );

      await store.exportAll();
      const exportRow = (await store.listAudit()).find(
        (e) => e.action === "export"
      );
      expect(exportRow!.diff).toEqual({ count: 0, skipped: 1 });

      const result = await store.importBundle(
        bundleOf([
          {
            kind: "adguard",
            instanceId: "broken",
            enabled: true,
            config: {
              kind: "adguard",
              instanceId: "broken",
              baseUrl: "http://127.0.0.1:3000",
            },
          },
        ])
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toMatch(/fails to load/);
    });

    it("rejects a bundle encrypted with a different master key", async () => {
      const other = createEncryptor(deriveKey("some-other-key"));
      await expect(
        store.importBundle({
          version: 1,
          exportedAt: new Date().toISOString(),
          payload: other.encryptJson([]).toString("base64"),
        })
      ).rejects.toThrow();
    });
  });

  it("loadAll returns all instances", async () => {
    await store.create({
      kind: "ipfs",
      instanceId: "a",
      apiUrl: "http://127.0.0.1:5001",
    });
    await store.create({
      kind: "bitcoin",
      instanceId: "main",
      rpcUrl: "http://127.0.0.1:8332",
      rpcUser: "u",
      rpcPassword: "p",
    });
    const all = await store.loadAll();
    expect(all.length).toBe(2);
  });

  describe("instance id rename", () => {
    it("renames an instance: persists, writes rename audit, emits renamed event", async () => {
      const created = await store.create({
        kind: "ipfs",
        instanceId: "old",
        apiUrl: "http://127.0.0.1:5001",
      });
      renamedEvents.length = 0;
      updatedEvents.length = 0;

      const renamed = await store.update(
        created.id,
        { kind: "ipfs", instanceId: "new", apiUrl: "http://127.0.0.1:5001" },
        "tester"
      );

      expect(renamed.instanceId).toBe("new");
      const reloaded = await store.get(created.id);
      expect(reloaded?.instanceId).toBe("new");

      const audit = await store.listAudit();
      const renameRow = audit.find((a) => a.action === "rename");
      expect(renameRow).toBeDefined();
      expect(renameRow!.targetId).toBe(created.id);
      expect(renameRow!.targetKind).toBe("ipfs");
      expect(renameRow!.diff).toEqual({ from: "old", to: "new" });
      expect(renameRow!.actor).toBe("tester");

      expect(renamedEvents).toEqual([
        {
          id: created.id,
          kind: "ipfs",
          oldInstanceId: "old",
          newInstanceId: "new",
        },
      ]);
      expect(updatedEvents).toHaveLength(1);
    });

    it("does not emit renamed event when instanceId unchanged", async () => {
      const created = await store.create({
        kind: "ipfs",
        instanceId: "main",
        apiUrl: "http://127.0.0.1:5001",
      });
      renamedEvents.length = 0;

      await store.update(created.id, {
        kind: "ipfs",
        instanceId: "main",
        apiUrl: "http://127.0.0.1:5002",
      });

      expect(renamedEvents).toHaveLength(0);
      const audit = await store.listAudit();
      expect(audit.some((a) => a.action === "rename")).toBe(false);
    });

    it("rejects rename when target id already in use for same kind", async () => {
      const a = await store.create({
        kind: "ipfs",
        instanceId: "a",
        apiUrl: "http://127.0.0.1:5001",
      });
      await store.create({
        kind: "ipfs",
        instanceId: "b",
        apiUrl: "http://127.0.0.1:5002",
      });

      await expect(
        store.update(a.id, {
          kind: "ipfs",
          instanceId: "b",
          apiUrl: "http://127.0.0.1:5001",
        })
      ).rejects.toBeInstanceOf(ValidationError);

      const reloaded = await store.get(a.id);
      expect(reloaded?.instanceId).toBe("a");
    });

    it("allows the same instance id across different kinds", async () => {
      const a = await store.create({
        kind: "ipfs",
        instanceId: "shared",
        apiUrl: "http://127.0.0.1:5001",
      });
      await store.create({
        kind: "bitcoin",
        instanceId: "main",
        rpcUrl: "http://127.0.0.1:8332",
        rpcUser: "u",
        rpcPassword: "p",
      });

      // Renaming bitcoin/main → bitcoin/shared should be fine even though
      // ipfs/shared already exists.
      const all = await store.loadAll();
      const btc = all.find((s) => s.kind === "bitcoin")!;
      const renamed = await store.update(btc.id, {
        kind: "bitcoin",
        instanceId: "shared",
        rpcUrl: "http://127.0.0.1:8332",
        rpcUser: "u",
        rpcPassword: "***",
      });

      expect(renamed.instanceId).toBe("shared");
      expect(a.instanceId).toBe("shared");
    });

    it("rejects invalid instance id (uppercase) on update", async () => {
      const created = await store.create({
        kind: "ipfs",
        instanceId: "good",
        apiUrl: "http://127.0.0.1:5001",
      });

      await expect(
        store.update(created.id, {
          kind: "ipfs",
          instanceId: "BadID",
          apiUrl: "http://127.0.0.1:5001",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects invalid instance id (leading dash) on update", async () => {
      const created = await store.create({
        kind: "ipfs",
        instanceId: "good",
        apiUrl: "http://127.0.0.1:5001",
      });

      await expect(
        store.update(created.id, {
          kind: "ipfs",
          instanceId: "-leading",
          apiUrl: "http://127.0.0.1:5001",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("reports schema failures on create as readable field errors", async () => {
      const err = await store
        .create({ kind: "ipfs", instanceId: "main", apiUrl: "not a url" })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      // Not the raw ZodError JSON dump that the UI used to show verbatim.
      expect((err as Error).message).toMatch(/^apiUrl: /);
      expect((err as Error).message).not.toContain("[");
    });

    it("rejects invalid instance id on create (uppercase)", async () => {
      await expect(
        store.create({
          kind: "ipfs",
          instanceId: "BadID",
          apiUrl: "http://127.0.0.1:5001",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("resilient loadAll (graceful degradation)", () => {
    // Insert a row directly so it bypasses create()'s validation, simulating a row
    // that became unloadable after the fact (master-key rotation, schema drift, a
    // kind removed from the code). loadAll() must not let it poison the others.
    async function insertRawRow(row: {
      kind: string;
      instanceId: string;
      configPublic: Record<string, unknown>;
    }): Promise<string> {
      const id = randomUUID();
      const now = toTs(new Date());
      await pool.withConnection((c) =>
        c.run(
          `INSERT INTO app_service_instance
            (id, kind, instance_id, enabled, config_public, config_secret, poll_policy, cache_ttl_ms, timeout_ms, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            row.kind,
            row.instanceId,
            true,
            JSON.stringify(row.configPublic),
            null,
            JSON.stringify({}),
            10_000,
            5_000,
            now,
            now,
          ]
        )
      );
      return id;
    }

    it("loads good services while skipping unloadable rows, surfacing them via loadErrors", async () => {
      const good = await store.create({
        kind: "ipfs",
        instanceId: "main",
        apiUrl: "http://127.0.0.1:5001",
      });
      // unknown kind (removed from code) and schema drift (adguard missing required baseUrl)
      const unknownId = await insertRawRow({
        kind: "bogus",
        instanceId: "x",
        configPublic: {},
      });
      const driftedId = await insertRawRow({
        kind: "adguard",
        instanceId: "drifted",
        configPublic: {},
      });

      const loaded = await store.loadAll();
      expect(loaded.map((s) => s.id)).toEqual([good.id]);

      const errors = await store.loadErrors();
      expect(errors.map((e) => e.id).sort()).toEqual(
        [unknownId, driftedId].sort()
      );
      expect(errors.find((e) => e.id === unknownId)?.kind).toBe("bogus");
    });

    it("deletes an unloadable row so the operator can recover", async () => {
      const badId = await insertRawRow({
        kind: "adguard",
        instanceId: "broken",
        configPublic: {},
      });
      expect((await store.loadErrors()).map((e) => e.id)).toContain(badId);

      await store.delete(badId);

      expect(await store.loadErrors()).toEqual([]);
      expect(await store.get(badId)).toBeNull();
    });
  });

  describe("audit timestamps and atomic writes", () => {
    const ipfs = (instanceId: string) => ({
      kind: "ipfs",
      instanceId,
      apiUrl: "http://127.0.0.1:5001",
    });

    // Make every audit insert fail, then recreate the table.
    async function withBrokenAudit(fn: () => Promise<void>) {
      await pool.withConnection(async (c) => {
        await c.run("DROP INDEX IF EXISTS idx_audit_ts");
        await c.run("DROP TABLE app_config_audit");
      });
      try {
        await fn();
      } finally {
        await pool.withConnection((c) => runConfigMigrations(c));
      }
    }

    it("writeAudit stores the timestamp it is given", async () => {
      const ts = new Date("2026-01-02T03:04:05.000Z");
      await store.writeAudit({
        action: "import",
        targetKind: null,
        targetId: null,
        diff: { source: "env" },
        actor: "env-migration",
        ts,
      });
      const [entry] = await store.listAudit(1);
      // Regression: ts was ignored and the row got the current time.
      expect(entry!.ts.getTime()).toBe(ts.getTime());
    });

    it("create leaves no row when its audit entry can't be written", async () => {
      await withBrokenAudit(async () => {
        await expect(store.create(ipfs("one"))).rejects.toThrow();
      });
      // Regression: the row was committed without its audit entry, so the
      // id stayed taken although create() had failed.
      expect(await store.loadAll()).toEqual([]);
      await expect(store.create(ipfs("one"))).resolves.toMatchObject({
        instanceId: "one",
      });
    });

    it("update keeps the old row when its audit entry can't be written", async () => {
      const svc = await store.create(ipfs("one"));
      await withBrokenAudit(async () => {
        await expect(
          store.update(svc.id, { ...ipfs("renamed") })
        ).rejects.toThrow();
      });
      const reloaded = await store.get(svc.id);
      expect(reloaded!.instanceId).toBe("one");
      expect(renamedEvents).toEqual([]);
    });

    it("delete keeps the row when its audit entry can't be written", async () => {
      const svc = await store.create(ipfs("one"));
      await withBrokenAudit(async () => {
        await expect(store.delete(svc.id)).rejects.toThrow();
      });
      expect(await store.get(svc.id)).not.toBeNull();
    });

    it("still reports a duplicate instance id as a ValidationError", async () => {
      await store.create(ipfs("one"));
      await expect(store.create(ipfs("one"))).rejects.toBeInstanceOf(
        ValidationError
      );
    });
  });

  describe("profiles in backups", () => {
    async function makeInstall() {
      const p = await createDuckDbPool({ path: ":memory:" });
      await p.withConnection((c) => runConfigMigrations(c));
      const profiles = createProfileStore(p);
      await profiles.ensureBootstrap();
      const s = createConfigStore(
        p,
        createEncryptor(deriveKey("unit-test-key")),
        createEventBus(),
        undefined,
        {
          resolveDefaultProfileId: () => profiles.getActiveProfileId(),
          profiles,
        }
      );
      return { pool: p, profiles, store: s };
    }

    const sig = {
      gatewayMac: "aa:bb:cc:dd:ee:ff",
      gatewayIp: "10.0.0.1",
      capturedAt: "2026-10-21T00:00:00.000Z",
    };

    it("restores profiles and puts services back in them on a new install", async () => {
      const a = await makeInstall();
      const b = await makeInstall();
      try {
        const travel = await a.profiles.createProfile({
          name: "Travel",
          color: "#123456",
          networkSigs: [sig],
        });
        await a.store.create(
          { kind: "ipfs", instanceId: "laptop", apiUrl: "http://h:5001" },
          undefined,
          travel.id
        );
        const bundle = await a.store.exportAll();
        expect(typeof bundle.profiles).toBe("string");

        const result = await b.store.importBundle(bundle);
        expect(result).toMatchObject({ imported: 1, errors: [] });

        // Regression: profiles weren't exported, so the service fell back to
        // the active (Default) profile on another install.
        const restored = (await b.profiles.listProfiles()).find(
          (p) => p.name === "Travel"
        );
        expect(restored).toMatchObject({
          color: "#123456",
          networkSigs: [expect.objectContaining({ gatewayIp: "10.0.0.1" })],
        });
        const [svc] = await b.store.loadAll();
        expect(svc!.profileId).toBe(restored!.id);
      } finally {
        await a.pool.close();
        await b.pool.close();
      }
    });

    it("reuses a local profile with the same name and leaves it unchanged", async () => {
      const a = await makeInstall();
      const b = await makeInstall();
      try {
        const exported = await a.profiles.createProfile({
          name: "Home",
          description: "from backup",
        });
        await a.store.create(
          { kind: "ipfs", instanceId: "nas", apiUrl: "http://h:5001" },
          undefined,
          exported.id
        );
        const local = await b.profiles.createProfile({
          name: "home",
          description: "local",
        });

        await b.store.importBundle(await a.store.exportAll());

        const homes = (await b.profiles.listProfiles()).filter(
          (p) => p.name.toLowerCase() === "home"
        );
        expect(homes).toHaveLength(1);
        expect(homes[0]!.description).toBe("local");
        const [svc] = await b.store.loadAll();
        expect(svc!.profileId).toBe(local.id);
      } finally {
        await a.pool.close();
        await b.pool.close();
      }
    });

    it("still imports a bundle without profiles", async () => {
      const a = await makeInstall();
      try {
        const bundle = await a.store.exportAll();
        delete bundle.profiles;
        await expect(a.store.importBundle(bundle)).resolves.toMatchObject({
          errors: [],
        });
      } finally {
        await a.pool.close();
      }
    });
  });
});
