import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDuckDbPool,
  type DuckDbPool,
} from "../../infra/db/DuckDbPool.js";
import { createEventBus } from "../../core/eventBus.js";
import { createEncryptor, deriveKey } from "./encryption.js";
import { runConfigMigrations } from "./migrations.js";
import { createConfigStore, type ConfigStore } from "./ConfigStore.js";
import {
  KIND_META,
  SERVICE_KINDS,
  type FieldMeta,
} from "../schemas/fieldMetadata.js";
import {
  createService,
  type ServiceInfra,
} from "../../bootstrap/registerServices.js";

// Fields the add-service form renders itself rather than from the kind schema.
const COMMON_FIELD_NAMES = new Set([
  "instanceId",
  "enabled",
  "cacheTtlMs",
  "timeoutMs",
]);

// What an operator types into a required field that has no default.
function sampleFor(f: FieldMeta): unknown {
  if (f.type === "url") return "http://192.168.1.10:8080";
  if (f.type === "number") return 1;
  return "192.168.1.10";
}

// Mirrors ServiceEditor.handleSubmit + configApi.createService: every field
// starts at its form default, the operator fills the required ones and the
// secrets, blank optional values are dropped, and the body is flattened.
function formPayload(kind: (typeof SERVICE_KINDS)[number]) {
  const fields = KIND_META[kind].fields;
  const fieldDefault = (name: string) =>
    fields.find((f) => f.name === name)?.default;
  const body: Record<string, unknown> = {
    kind,
    instanceId: "main",
    enabled: true,
    cacheTtlMs: fieldDefault("cacheTtlMs"),
    timeoutMs: fieldDefault("timeoutMs"),
  };
  for (const f of fields) {
    if (COMMON_FIELD_NAMES.has(f.name)) continue;
    let v: unknown = f.default;
    if (f.secret) v = `secret-${f.name}`;
    else if (v === undefined && f.required) v = sampleFor(f);
    else if (v === undefined) {
      v =
        f.type === "boolean"
          ? false
          : f.type === "stringArray" || f.type === "numberArray"
            ? []
            : "";
    }
    if (v === "" && !f.required) continue;
    if (Array.isArray(v) && v.length === 0 && !f.required) continue;
    body[f.name] = v;
  }
  return body;
}

// Construction only; nothing here is called until the poller runs a check.
const infra = {
  http: {},
  ping: {},
  tcp: {},
  ssh: {},
  snmp: {},
  pigpio: {},
  torControl: {},
  now: () => 0,
} as unknown as ServiceInfra;

describe("adding each service kind from the form", () => {
  let pool: DuckDbPool;
  let store: ConfigStore;

  beforeEach(async () => {
    pool = await createDuckDbPool({ path: ":memory:" });
    const conn = await pool.connect();
    await runConfigMigrations(conn);
    store = createConfigStore(
      pool,
      createEncryptor(deriveKey("unit-test-key")),
      createEventBus()
    );
  });

  afterEach(async () => {
    await pool.close();
  });

  it("covers every kind the form offers", () => {
    expect(SERVICE_KINDS).toHaveLength(13);
  });

  it.each(SERVICE_KINDS)(
    "%s saves, reloads with its secrets, and builds a service",
    async (kind) => {
      const created = await store.create(formPayload(kind));
      expect(created.kind).toBe(kind);

      const loaded = await store.get(created.id);
      expect(loaded).not.toBeNull();
      const config = loaded!.config as Record<string, unknown>;
      for (const name of KIND_META[kind].secretFields) {
        expect(config[name]).toBe(`secret-${name}`);
      }
      const redacted = store.redact(loaded!).config;
      for (const name of KIND_META[kind].secretFields) {
        expect(redacted[name]).toBe("***");
      }

      const svc = createService(loaded!.config, infra);
      expect(svc.kind).toBe(kind);
      expect(svc.instanceId).toBe("main");
    }
  );
});
