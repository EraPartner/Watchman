import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { DuckDbPool } from "../../infra/db/DuckDbPool.js";
import { toTs } from "../../infra/db/DuckDbPool.js";
import { ValidationError } from "../../core/errors.js";

const NAME_MAX_LENGTH = 64;

// A captured LAN fingerprint. gatewayMac is the primary identity (survives DHCP
// IP changes and distinguishes networks that share a private range); ip/subnet
// are informational. Matching during auto-switch is by gatewayMac.
export interface NetworkSignature {
  gatewayMac?: string;
  gatewayIp?: string;
  subnet?: string;
}

export interface CapturedSignature extends NetworkSignature {
  capturedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  description?: string;
  color?: string;
  networkSigs: CapturedSignature[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileInput {
  name?: unknown;
  description?: unknown;
  color?: unknown;
  networkSigs?: unknown;
}

export interface ProfileStore {
  listProfiles(): Promise<ReadonlyArray<Profile>>;
  getProfile(id: string): Promise<Profile | undefined>;
  createProfile(input: ProfileInput, actor?: string): Promise<Profile>;
  updateProfile(
    id: string,
    patch: ProfileInput,
    actor?: string
  ): Promise<Profile>;
  /** Throws ValidationError when the profile is active, non-empty, or the last remaining one. */
  deleteProfile(id: string, actor?: string): Promise<void>;
  /** Map of profileId -> number of service instances assigned to it. */
  serviceCounts(): Promise<Record<string, number>>;
  getActiveProfileId(): Promise<string | undefined>;
  setActiveProfileId(id: string, actor?: string): Promise<void>;
  getAutoSwitch(): Promise<boolean>;
  setAutoSwitch(enabled: boolean): Promise<void>;
  getLastSignature(): Promise<NetworkSignature | undefined>;
  setLastSignature(sig: NetworkSignature | undefined): Promise<void>;
  /**
   * Hold the invariant: ensure at least one profile exists and exactly one is
   * active, then assign any unassigned service instances to the active profile.
   * Idempotent — safe to call on every boot.
   */
  ensureBootstrap(logger?: Logger): Promise<void>;
}

const ACTIVE_PROFILE_KEY = "active_profile_id";
const AUTO_SWITCH_KEY = "auto_switch_enabled";
const LAST_SIGNATURE_KEY = "last_detected_signature";
const DEFAULT_PROFILE_NAME = "Default";

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof value === "object") return value as T;
  return fallback;
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("profile name is required");
  }
  const name = value.trim();
  if (name.length === 0) throw new ValidationError("profile name is required");
  if (name.length > NAME_MAX_LENGTH) {
    throw new ValidationError(
      `profile name exceeds max length ${NAME_MAX_LENGTH}`
    );
  }
  return name;
}

function normalizeSigs(value: unknown): CapturedSignature[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError("networkSigs must be an array");
  }
  return value.map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const out: CapturedSignature = {
      capturedAt:
        typeof s["capturedAt"] === "string"
          ? (s["capturedAt"] as string)
          : new Date().toISOString(),
    };
    if (typeof s["gatewayMac"] === "string")
      out.gatewayMac = (s["gatewayMac"] as string).toLowerCase();
    if (typeof s["gatewayIp"] === "string")
      out.gatewayIp = s["gatewayIp"] as string;
    if (typeof s["subnet"] === "string") out.subnet = s["subnet"] as string;
    return out;
  });
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s.length === 0 ? undefined : s;
}

export function createProfileStore(
  pool: DuckDbPool,
  logger?: Logger
): ProfileStore {
  function withConn<T>(fn: (c: DuckDBConnection) => Promise<T>): Promise<T> {
    return pool.withConnection(fn);
  }

  function rowToProfile(row: Record<string, unknown>): Profile {
    const description =
      row["description"] == null ? undefined : String(row["description"]);
    const color = row["color"] == null ? undefined : String(row["color"]);
    return {
      id: String(row["id"]),
      name: String(row["name"]),
      ...(description !== undefined ? { description } : {}),
      ...(color !== undefined ? { color } : {}),
      networkSigs: parseJson<CapturedSignature[]>(row["network_sigs"], []),
      createdAt:
        row["created_at"] instanceof Date
          ? (row["created_at"] as Date)
          : new Date(String(row["created_at"])),
      updatedAt:
        row["updated_at"] instanceof Date
          ? (row["updated_at"] as Date)
          : new Date(String(row["updated_at"])),
    };
  }

  async function insertAudit(
    c: DuckDBConnection,
    action: string,
    targetId: string | null,
    diff: unknown,
    actor: string | null
  ): Promise<void> {
    await c.run(
      `INSERT INTO app_config_audit (ts, action, target_kind, target_id, diff, actor)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        toTs(new Date()),
        action,
        "profile",
        targetId,
        JSON.stringify(diff ?? null),
        actor,
      ]
    );
  }

  async function readSetting(
    c: DuckDBConnection,
    key: string
  ): Promise<unknown> {
    const res = await c.runAndReadAll(
      `SELECT value FROM app_setting WHERE key = ?`,
      [key]
    );
    const rows = res.getRowObjects() as Array<Record<string, unknown>>;
    if (rows.length === 0) return undefined;
    return parseJson<unknown>(rows[0]!["value"], undefined);
  }

  async function writeSetting(
    c: DuckDBConnection,
    key: string,
    value: unknown
  ): Promise<void> {
    await c.run(
      `INSERT INTO app_setting (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value ?? null)]
    );
  }

  const store: ProfileStore = {
    async listProfiles(): Promise<ReadonlyArray<Profile>> {
      return withConn(async (c) => {
        const res = await c.runAndReadAll(
          `SELECT * FROM app_profile ORDER BY name`
        );
        const rows = res.getRowObjects() as Array<Record<string, unknown>>;
        return rows.map(rowToProfile);
      });
    },

    async getProfile(id: string): Promise<Profile | undefined> {
      return withConn(async (c) => {
        const res = await c.runAndReadAll(
          `SELECT * FROM app_profile WHERE id = ?`,
          [id]
        );
        const rows = res.getRowObjects() as Array<Record<string, unknown>>;
        return rows.length === 0 ? undefined : rowToProfile(rows[0]!);
      });
    },

    async createProfile(input: ProfileInput, actor?: string): Promise<Profile> {
      const name = normalizeName(input.name);
      const description = optionalString(input.description);
      const color = optionalString(input.color);
      const networkSigs = normalizeSigs(input.networkSigs);
      return withConn(async (c) => {
        const dup = await c.runAndReadAll(
          `SELECT id FROM app_profile WHERE name = ?`,
          [name]
        );
        if (dup.getRowObjects().length > 0) {
          throw new ValidationError(`profile name '${name}' already in use`);
        }
        const id = randomUUID();
        const now = new Date();
        await c.run(
          `INSERT INTO app_profile (id, name, description, color, network_sigs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            name,
            description ?? null,
            color ?? null,
            JSON.stringify(networkSigs),
            toTs(now),
            toTs(now),
          ]
        );
        await insertAudit(c, "profile.create", id, { name }, actor ?? null);
        return {
          id,
          name,
          ...(description !== undefined ? { description } : {}),
          ...(color !== undefined ? { color } : {}),
          networkSigs,
          createdAt: now,
          updatedAt: now,
        };
      });
    },

    async updateProfile(
      id: string,
      patch: ProfileInput,
      actor?: string
    ): Promise<Profile> {
      const existing = await this.getProfile(id);
      if (!existing) throw new ValidationError(`profile not found: ${id}`);
      const name =
        patch.name === undefined ? existing.name : normalizeName(patch.name);
      const description =
        patch.description === undefined
          ? existing.description
          : optionalString(patch.description);
      const color =
        patch.color === undefined
          ? existing.color
          : optionalString(patch.color);
      const networkSigs =
        patch.networkSigs === undefined
          ? existing.networkSigs
          : normalizeSigs(patch.networkSigs);
      return withConn(async (c) => {
        if (name !== existing.name) {
          const dup = await c.runAndReadAll(
            `SELECT id FROM app_profile WHERE name = ? AND id <> ?`,
            [name, id]
          );
          if (dup.getRowObjects().length > 0) {
            throw new ValidationError(`profile name '${name}' already in use`);
          }
        }
        const now = new Date();
        await c.run(
          `UPDATE app_profile
             SET name = ?, description = ?, color = ?, network_sigs = ?, updated_at = ?
           WHERE id = ?`,
          [
            name,
            description ?? null,
            color ?? null,
            JSON.stringify(networkSigs),
            toTs(now),
            id,
          ]
        );
        await insertAudit(
          c,
          "profile.update",
          id,
          { name, sigCount: networkSigs.length },
          actor ?? null
        );
        return {
          id,
          name,
          ...(description !== undefined ? { description } : {}),
          ...(color !== undefined ? { color } : {}),
          networkSigs,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
      });
    },

    async deleteProfile(id: string, actor?: string): Promise<void> {
      const existing = await this.getProfile(id);
      if (!existing) return;
      const activeId = await this.getActiveProfileId();
      if (activeId === id) {
        throw new ValidationError("cannot delete the active profile");
      }
      const counts = await this.serviceCounts();
      if ((counts[id] ?? 0) > 0) {
        throw new ValidationError(
          "cannot delete a profile that still has services; move or remove them first"
        );
      }
      const all = await this.listProfiles();
      if (all.length <= 1) {
        throw new ValidationError("cannot delete the last remaining profile");
      }
      await withConn(async (c) => {
        await c.run(`DELETE FROM app_profile WHERE id = ?`, [id]);
        await insertAudit(
          c,
          "profile.delete",
          id,
          { name: existing.name },
          actor ?? null
        );
      });
    },

    async serviceCounts(): Promise<Record<string, number>> {
      return withConn(async (c) => {
        const res = await c.runAndReadAll(
          `SELECT profile_id, COUNT(*) AS n FROM app_service_instance
           WHERE profile_id IS NOT NULL GROUP BY profile_id`
        );
        const rows = res.getRowObjects() as Array<Record<string, unknown>>;
        const out: Record<string, number> = {};
        for (const r of rows) {
          const pid = r["profile_id"] == null ? "" : String(r["profile_id"]);
          if (pid) out[pid] = Number(r["n"]);
        }
        return out;
      });
    },

    async getActiveProfileId(): Promise<string | undefined> {
      const v = await withConn((c) => readSetting(c, ACTIVE_PROFILE_KEY));
      return typeof v === "string" && v.length > 0 ? v : undefined;
    },

    async setActiveProfileId(id: string, actor?: string): Promise<void> {
      await withConn(async (c) => {
        await writeSetting(c, ACTIVE_PROFILE_KEY, id);
        await insertAudit(
          c,
          "profile.switch",
          id,
          { activeProfileId: id },
          actor ?? null
        );
      });
    },

    async getAutoSwitch(): Promise<boolean> {
      const v = await withConn((c) => readSetting(c, AUTO_SWITCH_KEY));
      // default ON when unset
      return v === undefined ? true : Boolean(v);
    },

    async setAutoSwitch(enabled: boolean): Promise<void> {
      await withConn((c) => writeSetting(c, AUTO_SWITCH_KEY, enabled));
    },

    async getLastSignature(): Promise<NetworkSignature | undefined> {
      const v = await withConn((c) => readSetting(c, LAST_SIGNATURE_KEY));
      return v && typeof v === "object" ? (v as NetworkSignature) : undefined;
    },

    async setLastSignature(sig: NetworkSignature | undefined): Promise<void> {
      await withConn((c) => writeSetting(c, LAST_SIGNATURE_KEY, sig ?? null));
    },

    async ensureBootstrap(bootLogger?: Logger): Promise<void> {
      const log = bootLogger ?? logger;
      const profiles = await this.listProfiles();
      let activeId = await this.getActiveProfileId();

      if (profiles.length === 0) {
        const created = await this.createProfile(
          { name: DEFAULT_PROFILE_NAME },
          "bootstrap"
        );
        activeId = created.id;
        await this.setActiveProfileId(activeId, "bootstrap");
        log?.info({ profileId: activeId }, "created Default profile");
      } else if (!activeId || !profiles.some((p) => p.id === activeId)) {
        // No active profile, or it points at a deleted one — pin the first.
        activeId = profiles[0]!.id;
        await this.setActiveProfileId(activeId, "bootstrap");
      }

      // Backfill any unassigned service rows into the active profile so the
      // one-profile-per-service invariant holds for pre-existing installs.
      const assigned = await withConn(async (c) => {
        const res = await c.run(
          `UPDATE app_service_instance SET profile_id = ?
           WHERE profile_id IS NULL OR profile_id = ''`,
          [activeId]
        );
        return res;
      });
      void assigned;
    },
  };

  return store;
}
