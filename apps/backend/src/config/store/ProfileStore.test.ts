import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDuckDbPool,
  toTs,
  type DuckDbPool,
} from "../../infra/db/DuckDbPool.js";
import { ValidationError } from "../../core/errors.js";
import { runConfigMigrations } from "./migrations.js";
import { createProfileStore, type ProfileStore } from "./ProfileStore.js";

async function insertRawService(
  pool: DuckDbPool,
  profileId: string | null
): Promise<string> {
  const id = randomUUID();
  const now = toTs(new Date());
  await pool.withConnection((c) =>
    c.run(
      `INSERT INTO app_service_instance
        (id, kind, instance_id, enabled, profile_id, config_public, config_secret, poll_policy, cache_ttl_ms, timeout_ms, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        "ipfs",
        id.slice(0, 8),
        true,
        profileId,
        JSON.stringify({ apiUrl: "http://127.0.0.1:5001" }),
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

describe("ProfileStore", () => {
  let pool: DuckDbPool;
  let store: ProfileStore;

  beforeEach(async () => {
    pool = await createDuckDbPool({ path: ":memory:" });
    const conn = await pool.connect();
    await runConfigMigrations(conn);
    pool.release(conn);
    store = createProfileStore(pool);
  });

  afterEach(async () => {
    await pool.close();
  });

  it("creates, reads, lists and updates a profile", async () => {
    const created = await store.createProfile({
      name: "Home",
      description: "home LAN",
      color: "#0af",
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Home");

    const loaded = await store.getProfile(created.id);
    expect(loaded?.description).toBe("home LAN");

    const updated = await store.updateProfile(created.id, { name: "House" });
    expect(updated.name).toBe("House");
    expect(updated.description).toBe("home LAN"); // preserved

    const all = await store.listProfiles();
    expect(all.map((p) => p.name)).toEqual(["House"]);
  });

  it("rejects duplicate and empty names", async () => {
    await store.createProfile({ name: "Office" });
    await expect(
      store.createProfile({ name: "Office" })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(store.createProfile({ name: "  " })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("ensureBootstrap creates a Default profile, sets it active, backfills services", async () => {
    const svc1 = await insertRawService(pool, null);
    const svc2 = await insertRawService(pool, "");

    await store.ensureBootstrap();

    const all = await store.listProfiles();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Default");
    expect(await store.getActiveProfileId()).toBe(all[0]!.id);

    const counts = await store.serviceCounts();
    expect(counts[all[0]!.id]).toBe(2);
    void svc1;
    void svc2;
  });

  it("ensureBootstrap is idempotent and keeps a valid active profile", async () => {
    await store.ensureBootstrap();
    const firstActive = await store.getActiveProfileId();
    await store.ensureBootstrap();
    expect(await store.listProfiles()).toHaveLength(1);
    expect(await store.getActiveProfileId()).toBe(firstActive);
  });

  it("enforces delete invariants (active, non-empty, last)", async () => {
    await store.ensureBootstrap();
    const defaultProfile = (await store.listProfiles())[0]!;
    const office = await store.createProfile({ name: "Office" });

    // active profile cannot be deleted
    await expect(store.deleteProfile(defaultProfile.id)).rejects.toBeInstanceOf(
      ValidationError
    );

    // non-empty profile cannot be deleted
    await insertRawService(pool, office.id);
    await expect(store.deleteProfile(office.id)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("deletes an empty, non-active, non-last profile", async () => {
    await store.ensureBootstrap();
    const office = await store.createProfile({ name: "Office" });
    await store.deleteProfile(office.id);
    expect(await store.getProfile(office.id)).toBeUndefined();
  });

  it("cannot delete the last remaining profile even if inactive", async () => {
    const only = await store.createProfile({ name: "Solo" });
    // no active profile set, and it's the last one
    await expect(store.deleteProfile(only.id)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("persists settings: autoSwitch defaults on, lastSignature round-trips", async () => {
    expect(await store.getAutoSwitch()).toBe(true);
    await store.setAutoSwitch(false);
    expect(await store.getAutoSwitch()).toBe(false);

    expect(await store.getLastSignature()).toBeUndefined();
    await store.setLastSignature({ gatewayMac: "aa:bb:cc:dd:ee:ff" });
    expect((await store.getLastSignature())?.gatewayMac).toBe(
      "aa:bb:cc:dd:ee:ff"
    );
  });

  it("captures network signatures on update", async () => {
    const p = await store.createProfile({ name: "Home" });
    const updated = await store.updateProfile(p.id, {
      networkSigs: [
        { gatewayMac: "AA:BB:CC:DD:EE:FF", capturedAt: "2026-01-01T00:00:00Z" },
      ],
    });
    expect(updated.networkSigs).toHaveLength(1);
    // normalized to lowercase
    expect(updated.networkSigs[0]!.gatewayMac).toBe("aa:bb:cc:dd:ee:ff");
  });
});
