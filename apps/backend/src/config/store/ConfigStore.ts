import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { DuckDBBlobValue, type DuckDBConnection } from "@duckdb/node-api";
import type { DuckDbPool } from "../../infra/db/DuckDbPool.js";
import { toTs } from "../../infra/db/DuckDbPool.js";
import type { EventBus } from "../../core/eventBus.js";
import { ValidationError } from "../../core/errors.js";
import {
  KIND_META,
  ServiceInstanceSchema,
  getSecretFields,
  isServiceKind,
  type ServiceKind,
} from "../schemas/index.js";
import type { ServiceInstance } from "../services.js";
import type { Encryptor } from "./encryption.js";
import type { ProfileStore } from "./ProfileStore.js";

const INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const INSTANCE_ID_MAX_LENGTH = 64;

function assertValidInstanceId(instanceId: string): void {
  if (instanceId.length === 0) {
    throw new ValidationError("instance id is required");
  }
  if (instanceId.length > INSTANCE_ID_MAX_LENGTH) {
    throw new ValidationError(
      `instance id '${instanceId}' exceeds max length ${INSTANCE_ID_MAX_LENGTH}`
    );
  }
  if (!INSTANCE_ID_PATTERN.test(instanceId)) {
    throw new ValidationError(
      `instance id '${instanceId}' must match ${INSTANCE_ID_PATTERN.source}`
    );
  }
}

export interface StoredService {
  id: string;
  kind: ServiceKind;
  instanceId: string;
  enabled: boolean;
  /** Owning profile (ADR-027). Empty string only transiently before bootstrap backfill. */
  profileId: string;
  config: ServiceInstance;
  createdAt: Date;
  updatedAt: Date;
}

export interface RedactedService {
  id: string;
  kind: ServiceKind;
  instanceId: string;
  enabled: boolean;
  profileId: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: number;
  ts: Date;
  action:
    | "create"
    | "update"
    | "delete"
    | "import"
    | "export"
    | "rename"
    | "profile.create"
    | "profile.update"
    | "profile.delete"
    | "profile.switch";
  targetKind: string | null;
  targetId: string | null;
  diff: unknown;
  actor: string | null;
}

const REDACTED = "***";

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  payload: string;
  /**
   * Base64 ciphertext of the exported profiles. A separate optional field
   * (not part of `payload`) so older versions still import the services.
   */
  profiles?: string;
}

/** A profile as carried in a bundle (inside the encrypted `profiles` field). */
interface ExportedProfile {
  id: string;
  name: string;
  description?: string;
  color?: string;
  networkSigs: unknown[];
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ kind: string; instanceId: string; message: string }>;
}

/**
 * A stored row that could not be turned into a usable service — e.g. secrets that
 * no longer decrypt after a WATCHMAN_MASTER_KEY rotation, a config that drifted out
 * of the current schema, or an unknown kind. Surfaced so one bad row degrades to a
 * visible, deletable entry instead of taking down every other service (see loadAll).
 */
export interface LoadError {
  id: string;
  kind: string;
  instanceId: string;
  message: string;
}

export interface ConfigStore {
  /** Successfully-loaded services only. Never throws on a single bad row — those are skipped and exposed via loadErrors(). */
  loadAll(): Promise<ReadonlyArray<StoredService>>;
  /** Rows that failed to load (decrypt/schema/kind). Pair with loadAll() to surface and recover broken config. */
  loadErrors(): Promise<ReadonlyArray<LoadError>>;
  get(id: string): Promise<StoredService | null>;
  create(
    input: unknown,
    actor?: string,
    profileId?: string
  ): Promise<StoredService>;
  update(id: string, input: unknown, actor?: string): Promise<StoredService>;
  delete(id: string, actor?: string): Promise<void>;
  /** Reassign a service to a different profile; emits config:service.updated so the lifecycle reconciles. */
  setProfile(id: string, profileId: string, actor?: string): Promise<void>;
  redact(svc: StoredService): RedactedService;
  listAudit(limit?: number): Promise<ReadonlyArray<AuditEntry>>;
  writeAudit(
    entry: Omit<AuditEntry, "id" | "ts"> & { ts?: Date }
  ): Promise<void>;
  exportAll(actor?: string): Promise<ExportBundle>;
  importBundle(bundle: unknown, actor?: string): Promise<ImportResult>;
}

function splitSecrets(
  kind: ServiceKind,
  config: Record<string, unknown>
): {
  publicPart: Record<string, unknown>;
  secretPart: Record<string, unknown>;
} {
  const secretFields = new Set(getSecretFields(kind));
  const publicPart: Record<string, unknown> = {};
  const secretPart: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (secretFields.has(k)) secretPart[k] = v;
    else publicPart[k] = v;
  }
  return { publicPart, secretPart };
}

function mergeSecrets(
  publicPart: Record<string, unknown>,
  secretPart: Record<string, unknown>
): Record<string, unknown> {
  return { ...publicPart, ...secretPart };
}

function redactConfig(
  kind: ServiceKind,
  config: Record<string, unknown>
): Record<string, unknown> {
  const secretFields = new Set(getSecretFields(kind));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = secretFields.has(k) && v !== undefined && v !== "" ? REDACTED : v;
  }
  return out;
}

function parseJsonColumn(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === "string")
    return JSON.parse(value) as Record<string, unknown>;
  if (typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function toBuffer(value: unknown): Buffer | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof DuckDBBlobValue) return Buffer.from(value.bytes);
  if (typeof value === "object" && value !== null && "bytes" in value) {
    const bytes = (value as { bytes: unknown }).bytes;
    if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  }
  if (typeof value === "string") return Buffer.from(value, "base64");
  return null;
}

export interface ConfigStoreOptions {
  /** Resolves the profile a newly-created service should land in when none is given (the active profile). */
  resolveDefaultProfileId?: () => Promise<string | undefined>;
  /** Lets export/import carry profiles. Without it, bundles hold services only. */
  profiles?: Pick<ProfileStore, "listProfiles" | "createProfile">;
}

export function createConfigStore(
  pool: DuckDbPool,
  encryptor: Encryptor,
  bus: EventBus,
  logger?: Logger,
  storeOpts?: ConfigStoreOptions
): ConfigStore {
  async function withConn<T>(
    fn: (c: DuckDBConnection) => Promise<T>
  ): Promise<T> {
    return pool.withConnection(fn);
  }

  // A row change and its audit entry commit together: a failed audit insert
  // must not leave a changed row with no audit entry and no config:* event.
  async function inTransaction<T>(
    fn: (c: DuckDBConnection) => Promise<T>
  ): Promise<T> {
    return withConn(async (c) => {
      await c.run("BEGIN TRANSACTION");
      try {
        const result = await fn(c);
        await c.run("COMMIT");
        return result;
      } catch (e) {
        // A failed COMMIT has already rolled back; ignore "no transaction".
        await c.run("ROLLBACK").catch(() => undefined);
        throw e;
      }
    });
  }

  async function instanceIdTaken(
    kind: string,
    instanceId: string,
    exceptId?: string
  ): Promise<boolean> {
    const rows = await withConn(async (c) => {
      const res = await c.runAndReadAll(
        `SELECT id FROM app_service_instance WHERE kind = ? AND instance_id = ?`,
        [kind, instanceId]
      );
      return res.getRowObjects() as Array<Record<string, unknown>>;
    });
    return rows.some((r) => String(r["id"]) !== exceptId);
  }

  function duplicateInstanceId(kind: string, instanceId: string) {
    return new ValidationError(
      `instance id '${instanceId}' already in use for kind '${kind}'`
    );
  }

  // Two concurrent writes can both pass the duplicate pre-check; the loser
  // then hits the unique index. Report that as the same ValidationError
  // instead of a raw constraint error.
  async function asDuplicateError(
    e: unknown,
    kind: string,
    instanceId: string,
    exceptId?: string
  ): Promise<unknown> {
    if (e instanceof ValidationError) return e;
    const taken = await instanceIdTaken(kind, instanceId, exceptId).catch(
      () => false
    );
    return taken ? duplicateInstanceId(kind, instanceId) : e;
  }

  // Single DB read, partitioned into usable services and per-row failures. A row that
  // fails to parse/decrypt is logged and skipped rather than rejecting the whole batch,
  // so one corrupt instance can't stop every other service from coming up at startup.
  async function loadAllPartitioned(): Promise<{
    services: StoredService[];
    errors: LoadError[];
  }> {
    return withConn(async (c) => {
      const result = await c.runAndReadAll(
        `SELECT * FROM app_service_instance ORDER BY kind, instance_id`
      );
      const rows = result.getRowObjects() as Array<Record<string, unknown>>;
      const services: StoredService[] = [];
      const errors: LoadError[] = [];
      for (const r of rows) {
        try {
          services.push(await rowToStored(r));
        } catch (err) {
          const entry: LoadError = {
            id: String(r["id"] ?? ""),
            kind: String(r["kind"] ?? "unknown"),
            instanceId: String(r["instance_id"] ?? ""),
            message: err instanceof Error ? err.message : String(err),
          };
          errors.push(entry);
          logger?.warn(
            {
              err,
              id: entry.id,
              kind: entry.kind,
              instanceId: entry.instanceId,
            },
            "service config row failed to load; skipping"
          );
        }
      }
      return { services, errors };
    });
  }

  async function rowToStored(
    row: Record<string, unknown>
  ): Promise<StoredService> {
    const kind = String(row["kind"]);
    if (!isServiceKind(kind)) {
      throw new Error(`Unknown service kind in DB: ${kind}`);
    }
    const publicPart = parseJsonColumn(row["config_public"]);
    const secretCipher = toBuffer(row["config_secret"]);
    const secretPart: Record<string, unknown> = secretCipher
      ? (encryptor.decryptJson(secretCipher) as Record<string, unknown>)
      : {};
    const pollPolicy = parseJsonColumn(row["poll_policy"]);
    const merged = {
      kind,
      instanceId: String(row["instance_id"]),
      enabled: Boolean(row["enabled"]),
      pollPolicy,
      cacheTtlMs: Number(row["cache_ttl_ms"]),
      timeoutMs: Number(row["timeout_ms"]),
      ...mergeSecrets(publicPart, secretPart),
    };
    const config = ServiceInstanceSchema.parse(merged);
    const createdAt =
      row["created_at"] instanceof Date
        ? row["created_at"]
        : new Date(String(row["created_at"]));
    const updatedAt =
      row["updated_at"] instanceof Date
        ? row["updated_at"]
        : new Date(String(row["updated_at"]));
    return {
      id: String(row["id"]),
      kind,
      instanceId: String(row["instance_id"]),
      enabled: Boolean(row["enabled"]),
      profileId: row["profile_id"] == null ? "" : String(row["profile_id"]),
      config,
      createdAt,
      updatedAt,
    };
  }

  function validate(input: unknown): ServiceInstance {
    const result = ServiceInstanceSchema.safeParse(input);
    // A ZodError's message is the issue list as raw JSON, which the UI shows
    // verbatim; flatten it to "field: problem" lines instead.
    if (!result.success) {
      throw new ValidationError(
        result.error.issues
          .map(
            (i) => `${i.path.map(String).join(".") || "input"}: ${i.message}`
          )
          .join("; ")
      );
    }
    const parsed = result.data;
    if (!isServiceKind(parsed.kind)) {
      throw new Error(`Unknown kind: ${parsed.kind}`);
    }
    return parsed;
  }

  function extractStorable(config: ServiceInstance): {
    kind: ServiceKind;
    instanceId: string;
    enabled: boolean;
    pollPolicy: unknown;
    cacheTtlMs: number;
    timeoutMs: number;
    publicPart: Record<string, unknown>;
    secretPart: Record<string, unknown>;
  } {
    const {
      kind,
      instanceId,
      enabled,
      pollPolicy,
      cacheTtlMs,
      timeoutMs,
      ...rest
    } = config as Record<string, unknown> & ServiceInstance;
    const { publicPart, secretPart } = splitSecrets(
      config.kind as ServiceKind,
      rest as Record<string, unknown>
    );
    return {
      kind: kind as ServiceKind,
      instanceId: instanceId as string,
      enabled: enabled as boolean,
      pollPolicy,
      cacheTtlMs: cacheTtlMs as number,
      timeoutMs: timeoutMs as number,
      publicPart,
      secretPart,
    };
  }

  async function insertAudit(
    c: DuckDBConnection,
    action: AuditEntry["action"],
    kind: string | null,
    targetId: string | null,
    diff: unknown,
    actor: string | null,
    ts: Date = new Date()
  ): Promise<void> {
    await c.run(
      `INSERT INTO app_config_audit (ts, action, target_kind, target_id, diff, actor)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [toTs(ts), action, kind, targetId, JSON.stringify(diff ?? null), actor]
    );
  }

  return {
    async loadAll(): Promise<ReadonlyArray<StoredService>> {
      return (await loadAllPartitioned()).services;
    },

    async loadErrors(): Promise<ReadonlyArray<LoadError>> {
      return (await loadAllPartitioned()).errors;
    },

    async get(id: string): Promise<StoredService | null> {
      return withConn(async (c) => {
        const result = await c.runAndReadAll(
          `SELECT * FROM app_service_instance WHERE id = ?`,
          [id]
        );
        const rows = result.getRowObjects() as Array<Record<string, unknown>>;
        if (rows.length === 0) return null;
        return rowToStored(rows[0]!);
      });
    },

    async create(
      input: unknown,
      actor?: string,
      profileId?: string
    ): Promise<StoredService> {
      const config = validate(input);
      const parts = extractStorable(config);
      if (!KIND_META[parts.kind])
        throw new Error(`Unsupported kind: ${parts.kind}`);
      assertValidInstanceId(parts.instanceId);
      const resolvedProfileId =
        profileId ?? (await storeOpts?.resolveDefaultProfileId?.()) ?? "";
      const stored = await inTransaction(async (c): Promise<StoredService> => {
        const dup = await c.runAndReadAll(
          `SELECT id FROM app_service_instance WHERE kind = ? AND instance_id = ?`,
          [parts.kind, parts.instanceId]
        );
        if (dup.getRowObjects().length > 0) {
          throw duplicateInstanceId(parts.kind, parts.instanceId);
        }
        const id = randomUUID();
        const now = new Date();
        const secretCipher =
          Object.keys(parts.secretPart).length > 0
            ? new DuckDBBlobValue(encryptor.encryptJson(parts.secretPart))
            : null;
        await c.run(
          `INSERT INTO app_service_instance
            (id, kind, instance_id, enabled, profile_id, config_public, config_secret, poll_policy, cache_ttl_ms, timeout_ms, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            parts.kind,
            parts.instanceId,
            parts.enabled,
            resolvedProfileId || null,
            JSON.stringify(parts.publicPart),
            secretCipher,
            JSON.stringify(parts.pollPolicy),
            parts.cacheTtlMs,
            parts.timeoutMs,
            toTs(now),
            toTs(now),
          ]
        );
        await insertAudit(
          c,
          "create",
          parts.kind,
          id,
          {
            kind: parts.kind,
            instanceId: parts.instanceId,
            profileId: resolvedProfileId,
          },
          actor ?? null
        );
        return {
          id,
          kind: parts.kind,
          instanceId: parts.instanceId,
          enabled: parts.enabled,
          profileId: resolvedProfileId,
          config,
          createdAt: now,
          updatedAt: now,
        };
      }).catch(async (e: unknown) => {
        throw await asDuplicateError(e, parts.kind, parts.instanceId);
      });
      bus.emit("config:service.created", {
        id: stored.id,
        kind: stored.kind,
        instanceId: stored.instanceId,
      });
      return stored;
    },

    async update(
      id: string,
      input: unknown,
      actor?: string
    ): Promise<StoredService> {
      const existing = await this.get(id);
      if (!existing) throw new Error(`Not found: ${id}`);
      const mergedInput = mergeSecretsWithExisting(
        input,
        existing,
        getSecretFields(existing.kind)
      );
      const config = validate(mergedInput);
      if (config.kind !== existing.kind) {
        throw new Error(
          `Cannot change kind on update (${existing.kind} -> ${config.kind})`
        );
      }
      const parts = extractStorable(config);
      assertValidInstanceId(parts.instanceId);
      const isRename = parts.instanceId !== existing.instanceId;
      const stored = await inTransaction(async (c): Promise<StoredService> => {
        if (isRename) {
          const dup = await c.runAndReadAll(
            `SELECT id FROM app_service_instance
             WHERE kind = ? AND instance_id = ? AND id <> ?`,
            [parts.kind, parts.instanceId, id]
          );
          if (dup.getRowObjects().length > 0) {
            throw duplicateInstanceId(parts.kind, parts.instanceId);
          }
        }
        const now = new Date();
        const secretCipher =
          Object.keys(parts.secretPart).length > 0
            ? new DuckDBBlobValue(encryptor.encryptJson(parts.secretPart))
            : null;
        await c.run(
          `UPDATE app_service_instance
             SET instance_id = ?,
                 enabled = ?,
                 config_public = ?,
                 config_secret = ?,
                 poll_policy = ?,
                 cache_ttl_ms = ?,
                 timeout_ms = ?,
                 updated_at = ?
           WHERE id = ?`,
          [
            parts.instanceId,
            parts.enabled,
            JSON.stringify(parts.publicPart),
            secretCipher,
            JSON.stringify(parts.pollPolicy),
            parts.cacheTtlMs,
            parts.timeoutMs,
            toTs(now),
            id,
          ]
        );
        const diff = {
          before: redactConfig(
            existing.kind,
            existing.config as unknown as Record<string, unknown>
          ),
          after: redactConfig(
            parts.kind,
            config as unknown as Record<string, unknown>
          ),
        };
        await insertAudit(c, "update", parts.kind, id, diff, actor ?? null);
        if (isRename) {
          await insertAudit(
            c,
            "rename",
            parts.kind,
            id,
            { from: existing.instanceId, to: parts.instanceId },
            actor ?? null
          );
        }
        return {
          id,
          kind: parts.kind,
          instanceId: parts.instanceId,
          enabled: parts.enabled,
          profileId: existing.profileId,
          config,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
      }).catch(async (e: unknown) => {
        throw isRename
          ? await asDuplicateError(e, parts.kind, parts.instanceId, id)
          : e;
      });
      bus.emit("config:service.updated", {
        id,
        kind: parts.kind,
        instanceId: parts.instanceId,
      });
      if (isRename) {
        bus.emit("config:service.renamed", {
          id,
          kind: parts.kind,
          oldInstanceId: existing.instanceId,
          newInstanceId: parts.instanceId,
        });
      }
      return stored;
    },

    async delete(id: string, actor?: string): Promise<void> {
      // Resolve identity without requiring a successful parse: a corrupt/undecryptable
      // row (the kind surfaced by loadErrors) must still be deletable so the operator
      // can recover. get() re-parses and would throw on exactly those rows.
      let kind = "";
      let instanceId = "";
      try {
        const existing = await this.get(id);
        if (!existing) return;
        kind = existing.kind;
        instanceId = existing.instanceId;
      } catch {
        const identity = await withConn(async (c) => {
          const res = await c.runAndReadAll(
            `SELECT kind, instance_id FROM app_service_instance WHERE id = ?`,
            [id]
          );
          return res.getRowObjects() as Array<Record<string, unknown>>;
        });
        if (identity.length === 0) return;
        kind = String(identity[0]!["kind"] ?? "");
        instanceId = String(identity[0]!["instance_id"] ?? "");
      }
      await inTransaction(async (c) => {
        await c.run(`DELETE FROM app_service_instance WHERE id = ?`, [id]);
        await insertAudit(
          c,
          "delete",
          kind || null,
          id,
          { kind, instanceId },
          actor ?? null
        );
      });
      bus.emit("config:service.deleted", { id, kind, instanceId });
    },

    async setProfile(
      id: string,
      profileId: string,
      actor?: string
    ): Promise<void> {
      const existing = await this.get(id);
      if (!existing) throw new Error(`Not found: ${id}`);
      if (existing.profileId === profileId) return;
      await inTransaction(async (c) => {
        const now = new Date();
        await c.run(
          `UPDATE app_service_instance SET profile_id = ?, updated_at = ? WHERE id = ?`,
          [profileId, toTs(now), id]
        );
        await insertAudit(
          c,
          "update",
          existing.kind,
          id,
          { profileMove: { from: existing.profileId, to: profileId } },
          actor ?? null
        );
      });
      bus.emit("config:service.updated", {
        id,
        kind: existing.kind,
        instanceId: existing.instanceId,
      });
    },

    redact(svc: StoredService): RedactedService {
      return {
        id: svc.id,
        kind: svc.kind,
        instanceId: svc.instanceId,
        enabled: svc.enabled,
        profileId: svc.profileId,
        config: redactConfig(
          svc.kind,
          svc.config as unknown as Record<string, unknown>
        ),
        createdAt: svc.createdAt.toISOString(),
        updatedAt: svc.updatedAt.toISOString(),
      };
    },

    async listAudit(limit = 100): Promise<ReadonlyArray<AuditEntry>> {
      // The limit is interpolated into SQL, so a non-finite value must never reach it.
      const safeLimit = Number.isFinite(limit)
        ? Math.floor(Math.max(1, Math.min(limit, 1000)))
        : 100;
      return withConn(async (c) => {
        // id breaks ts ties: rows written in the same millisecond (update + rename)
        // otherwise come back in arbitrary order.
        const result = await c.runAndReadAll(
          `SELECT * FROM app_config_audit ORDER BY ts DESC, id DESC LIMIT ${safeLimit}`
        );
        const rows = result.getRowObjects() as Array<Record<string, unknown>>;
        return rows.map((r) => ({
          id: Number(r["id"]),
          ts: r["ts"] instanceof Date ? r["ts"] : new Date(String(r["ts"])),
          action: String(r["action"]) as AuditEntry["action"],
          targetKind:
            r["target_kind"] == null ? null : String(r["target_kind"]),
          targetId: r["target_id"] == null ? null : String(r["target_id"]),
          diff: r["diff"] == null ? null : parseJsonColumn(r["diff"]),
          actor: r["actor"] == null ? null : String(r["actor"]),
        }));
      });
    },

    async writeAudit(entry): Promise<void> {
      await withConn((c) =>
        insertAudit(
          c,
          entry.action,
          entry.targetKind,
          entry.targetId,
          entry.diff,
          entry.actor ?? null,
          entry.ts
        )
      );
    },

    async exportAll(actor?: string): Promise<ExportBundle> {
      // Rows that fail to load can't be exported; count them in the audit row so
      // an incomplete backup is visible (the UI warns from /config/load-errors).
      const { services: all, errors: unloadable } = await loadAllPartitioned();
      const plaintext = all.map((s) => ({
        kind: s.kind,
        instanceId: s.instanceId,
        enabled: s.enabled,
        profileId: s.profileId,
        config: s.config,
      }));
      const cipher = encryptor.encryptJson(plaintext);
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        payload: cipher.toString("base64"),
      };
      // Profiles hold captured network fingerprints, so they are encrypted too.
      const profiles: ExportedProfile[] = storeOpts?.profiles
        ? (await storeOpts.profiles.listProfiles()).map((p) => ({
            id: p.id,
            name: p.name,
            ...(p.description !== undefined
              ? { description: p.description }
              : {}),
            ...(p.color !== undefined ? { color: p.color } : {}),
            networkSigs: p.networkSigs,
          }))
        : [];
      if (storeOpts?.profiles) {
        bundle.profiles = encryptor.encryptJson(profiles).toString("base64");
      }
      await withConn((c) =>
        insertAudit(
          c,
          "export",
          null,
          null,
          {
            count: plaintext.length,
            skipped: unloadable.length,
            ...(storeOpts?.profiles ? { profiles: profiles.length } : {}),
          },
          actor ?? null
        )
      );
      return bundle;
    },

    async importBundle(bundle: unknown, actor?: string): Promise<ImportResult> {
      if (typeof bundle !== "object" || bundle === null) {
        throw new Error("Invalid bundle: must be object");
      }
      const b = bundle as Record<string, unknown>;
      if (b["version"] !== 1)
        throw new Error("Invalid bundle: unsupported version");
      if (typeof b["payload"] !== "string")
        throw new Error("Invalid bundle: payload missing");
      const cipher = Buffer.from(b["payload"] as string, "base64");
      const plaintext = encryptor.decryptJson(cipher);
      if (!Array.isArray(plaintext))
        throw new Error("Invalid bundle: decoded payload must be array");

      const { services: existing, errors: unloadable } =
        await loadAllPartitioned();
      const byKey = new Map<string, StoredService>();
      for (const s of existing) byKey.set(`${s.kind}/${s.instanceId}`, s);
      const unloadableKeys = new Set(
        unloadable.map((e) => `${e.kind}/${e.instanceId}`)
      );
      const profileIds = await withConn(async (c) => {
        const res = await c.runAndReadAll(`SELECT id FROM app_profile`);
        return new Set(
          (res.getRowObjects() as Array<Record<string, unknown>>).map((r) =>
            String(r["id"])
          )
        );
      });

      const result: ImportResult = {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: [],
      };

      // Map each exported profile to a local one: the same id, else the same
      // name, else a newly created profile. Existing profiles are never
      // modified, and the active profile is not changed.
      const profileMap = new Map<string, string>();
      let profilesCreated = 0;
      if (typeof b["profiles"] === "string" && storeOpts?.profiles) {
        const exported = encryptor.decryptJson(
          Buffer.from(b["profiles"], "base64")
        );
        if (!Array.isArray(exported))
          throw new Error("Invalid bundle: decoded profiles must be array");
        const local = await storeOpts.profiles.listProfiles();
        const localIds = new Set(local.map((p) => p.id));
        const localByName = new Map(
          local.map((p) => [p.name.trim().toLowerCase(), p.id])
        );
        for (const raw of exported) {
          if (typeof raw !== "object" || raw === null) continue;
          const p = raw as Partial<ExportedProfile>;
          const name = typeof p.name === "string" ? p.name : "";
          if (typeof p.id !== "string" || name.trim() === "") continue;
          if (localIds.has(p.id)) {
            profileMap.set(p.id, p.id);
            continue;
          }
          const sameName = localByName.get(name.trim().toLowerCase());
          if (sameName) {
            profileMap.set(p.id, sameName);
            continue;
          }
          try {
            const created = await storeOpts.profiles.createProfile(
              {
                name,
                description: p.description,
                color: p.color,
                networkSigs: p.networkSigs,
              },
              actor
            );
            profileMap.set(p.id, created.id);
            localByName.set(name.trim().toLowerCase(), created.id);
            profileIds.add(created.id);
            profilesCreated += 1;
          } catch (err) {
            result.errors.push({
              kind: "profile",
              instanceId: name,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      for (const raw of plaintext) {
        if (typeof raw !== "object" || raw === null) {
          result.skipped += 1;
          continue;
        }
        const entry = raw as {
          kind?: unknown;
          instanceId?: unknown;
          profileId?: unknown;
          config?: unknown;
        };
        const kind = String(entry.kind ?? "");
        const instanceId = String(entry.instanceId ?? "");
        try {
          const cfg = entry.config as Record<string, unknown> | undefined;
          if (!cfg) throw new Error("missing config");
          const match = byKey.get(`${kind}/${instanceId}`);
          if (match) {
            // Existing services keep their current profile.
            await this.update(match.id, cfg, actor);
            result.updated += 1;
          } else if (unloadableKeys.has(`${kind}/${instanceId}`)) {
            throw new Error(
              "an existing row with this kind and instance id fails to load; delete it under Settings > Services, then import again"
            );
          } else {
            // Restore the exported profile when it still exists here; otherwise
            // (older bundle, or a profile that is gone) create() uses the active one.
            const exportedProfileId =
              typeof entry.profileId === "string"
                ? (profileMap.get(entry.profileId) ?? entry.profileId)
                : undefined;
            const profileId =
              exportedProfileId !== undefined &&
              profileIds.has(exportedProfileId)
                ? exportedProfileId
                : undefined;
            const created = await this.create(cfg, actor, profileId);
            // A later entry with the same (kind, instanceId) updates this one
            // instead of failing as a duplicate.
            byKey.set(`${kind}/${instanceId}`, created);
            result.imported += 1;
          }
        } catch (err) {
          result.errors.push({
            kind,
            instanceId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await withConn((c) =>
        insertAudit(
          c,
          "import",
          null,
          null,
          {
            imported: result.imported,
            updated: result.updated,
            skipped: result.skipped,
            errors: result.errors.length,
            profilesCreated,
          },
          actor ?? null
        )
      );
      return result;
    },
  };
}

// Base fields preserved from the existing record when an update omits them;
// without this a partial update silently resets them to schema defaults
// (e.g. a custom pollPolicy reverting to 10s/30s).
const PRESERVED_BASE_FIELDS = [
  "instanceId",
  "enabled",
  "pollPolicy",
  "cacheTtlMs",
  "timeoutMs",
] as const;

function mergeSecretsWithExisting(
  input: unknown,
  existing: StoredService,
  secretFields: ReadonlyArray<string>
): unknown {
  if (typeof input !== "object" || input === null) return input;
  const clone = { ...(input as Record<string, unknown>) };
  const existingConfig = existing.config as unknown as Record<string, unknown>;
  for (const field of secretFields) {
    const incoming = clone[field];
    if (incoming === undefined || incoming === REDACTED || incoming === "") {
      if (existingConfig[field] !== undefined) {
        clone[field] = existingConfig[field];
      }
    }
  }
  for (const field of PRESERVED_BASE_FIELDS) {
    if (clone[field] === undefined && existingConfig[field] !== undefined) {
      clone[field] = existingConfig[field];
    }
  }
  if (clone["kind"] === undefined) clone["kind"] = existing.kind;
  return clone;
}
