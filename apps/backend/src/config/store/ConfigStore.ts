import { randomUUID } from "node:crypto";
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
  config: ServiceInstance;
  createdAt: Date;
  updatedAt: Date;
}

export interface RedactedService {
  id: string;
  kind: ServiceKind;
  instanceId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: number;
  ts: Date;
  action: "create" | "update" | "delete" | "import" | "export" | "rename";
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
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ kind: string; instanceId: string; message: string }>;
}

export interface ConfigStore {
  loadAll(): Promise<ReadonlyArray<StoredService>>;
  get(id: string): Promise<StoredService | null>;
  create(input: unknown, actor?: string): Promise<StoredService>;
  update(id: string, input: unknown, actor?: string): Promise<StoredService>;
  delete(id: string, actor?: string): Promise<void>;
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

export function createConfigStore(
  pool: DuckDbPool,
  encryptor: Encryptor,
  bus: EventBus
): ConfigStore {
  async function withConn<T>(
    fn: (c: DuckDBConnection) => Promise<T>
  ): Promise<T> {
    return pool.withConnection(fn);
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
      config,
      createdAt,
      updatedAt,
    };
  }

  function validate(input: unknown): ServiceInstance {
    const parsed = ServiceInstanceSchema.parse(input);
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
    actor: string | null
  ): Promise<void> {
    await c.run(
      `INSERT INTO app_config_audit (ts, action, target_kind, target_id, diff, actor)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        toTs(new Date()),
        action,
        kind,
        targetId,
        JSON.stringify(diff ?? null),
        actor,
      ]
    );
  }

  return {
    async loadAll(): Promise<ReadonlyArray<StoredService>> {
      return withConn(async (c) => {
        const result = await c.runAndReadAll(
          `SELECT * FROM app_service_instance ORDER BY kind, instance_id`
        );
        const rows = result.getRowObjects() as Array<Record<string, unknown>>;
        const out: StoredService[] = [];
        for (const r of rows) out.push(await rowToStored(r));
        return out;
      });
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

    async create(input: unknown, actor?: string): Promise<StoredService> {
      const config = validate(input);
      const parts = extractStorable(config);
      if (!KIND_META[parts.kind])
        throw new Error(`Unsupported kind: ${parts.kind}`);
      assertValidInstanceId(parts.instanceId);
      const stored = await withConn(async (c): Promise<StoredService> => {
        const dup = await c.runAndReadAll(
          `SELECT id FROM app_service_instance WHERE kind = ? AND instance_id = ?`,
          [parts.kind, parts.instanceId]
        );
        if (dup.getRowObjects().length > 0) {
          throw new ValidationError(
            `instance id '${parts.instanceId}' already in use for kind '${parts.kind}'`
          );
        }
        const id = randomUUID();
        const now = new Date();
        const secretCipher =
          Object.keys(parts.secretPart).length > 0
            ? new DuckDBBlobValue(encryptor.encryptJson(parts.secretPart))
            : null;
        await c.run(
          `INSERT INTO app_service_instance
            (id, kind, instance_id, enabled, config_public, config_secret, poll_policy, cache_ttl_ms, timeout_ms, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            parts.kind,
            parts.instanceId,
            parts.enabled,
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
          { kind: parts.kind, instanceId: parts.instanceId },
          actor ?? null
        );
        return {
          id,
          kind: parts.kind,
          instanceId: parts.instanceId,
          enabled: parts.enabled,
          config,
          createdAt: now,
          updatedAt: now,
        };
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
      const stored = await withConn(async (c): Promise<StoredService> => {
        if (isRename) {
          const dup = await c.runAndReadAll(
            `SELECT id FROM app_service_instance
             WHERE kind = ? AND instance_id = ? AND id <> ?`,
            [parts.kind, parts.instanceId, id]
          );
          if (dup.getRowObjects().length > 0) {
            throw new ValidationError(
              `instance id '${parts.instanceId}' already in use for kind '${parts.kind}'`
            );
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
          config,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
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
      const existing = await this.get(id);
      if (!existing) return;
      await withConn(async (c) => {
        await c.run(`DELETE FROM app_service_instance WHERE id = ?`, [id]);
        await insertAudit(
          c,
          "delete",
          existing.kind,
          id,
          { kind: existing.kind, instanceId: existing.instanceId },
          actor ?? null
        );
      });
      bus.emit("config:service.deleted", {
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
        config: redactConfig(
          svc.kind,
          svc.config as unknown as Record<string, unknown>
        ),
        createdAt: svc.createdAt.toISOString(),
        updatedAt: svc.updatedAt.toISOString(),
      };
    },

    async listAudit(limit = 100): Promise<ReadonlyArray<AuditEntry>> {
      return withConn(async (c) => {
        const result = await c.runAndReadAll(
          `SELECT * FROM app_config_audit ORDER BY ts DESC LIMIT ${Math.floor(Math.max(1, Math.min(limit, 1000)))}`
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
          entry.actor ?? null
        )
      );
    },

    async exportAll(actor?: string): Promise<ExportBundle> {
      const all = await this.loadAll();
      const plaintext = all.map((s) => ({
        kind: s.kind,
        instanceId: s.instanceId,
        enabled: s.enabled,
        config: s.config,
      }));
      const cipher = encryptor.encryptJson(plaintext);
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        payload: cipher.toString("base64"),
      };
      await withConn((c) =>
        insertAudit(
          c,
          "export",
          null,
          null,
          { count: plaintext.length },
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

      const existing = await this.loadAll();
      const byKey = new Map<string, StoredService>();
      for (const s of existing) byKey.set(`${s.kind}/${s.instanceId}`, s);

      const result: ImportResult = {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: [],
      };
      for (const raw of plaintext) {
        if (typeof raw !== "object" || raw === null) {
          result.skipped += 1;
          continue;
        }
        const entry = raw as {
          kind?: unknown;
          instanceId?: unknown;
          config?: unknown;
        };
        const kind = String(entry.kind ?? "");
        const instanceId = String(entry.instanceId ?? "");
        try {
          const cfg = entry.config as Record<string, unknown> | undefined;
          if (!cfg) throw new Error("missing config");
          const match = byKey.get(`${kind}/${instanceId}`);
          if (match) {
            await this.update(match.id, cfg, actor);
            result.updated += 1;
          } else {
            await this.create(cfg, actor);
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
