import type { DuckDBConnection } from "@duckdb/node-api";

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS app_service_instance (
     id              TEXT PRIMARY KEY,
     kind            TEXT NOT NULL,
     instance_id     TEXT NOT NULL,
     enabled         BOOLEAN NOT NULL,
     config_public   JSON NOT NULL,
     config_secret   BLOB,
     poll_policy     JSON NOT NULL,
     cache_ttl_ms    INTEGER NOT NULL,
     timeout_ms      INTEGER NOT NULL,
     created_at      TIMESTAMP NOT NULL,
     updated_at      TIMESTAMP NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_service_kind_instance ON app_service_instance (kind, instance_id)`,
  `CREATE SEQUENCE IF NOT EXISTS seq_app_config_audit`,
  `CREATE TABLE IF NOT EXISTS app_config_audit (
     id              BIGINT PRIMARY KEY DEFAULT nextval('seq_app_config_audit'),
     ts              TIMESTAMP NOT NULL,
     action          TEXT NOT NULL,
     target_kind     TEXT,
     target_id       TEXT,
     diff            JSON,
     actor           TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_ts ON app_config_audit (ts)`,
  // ─── Profiles (ADR-027) ──────────────────────────────────────────────────
  // A profile owns a disjoint set of service instances; exactly one is active at
  // a time and only its services are monitored. network_sigs holds captured LAN
  // fingerprints ({ gatewayMac?, gatewayIp?, subnet?, capturedAt }[]) for auto-switch.
  `CREATE TABLE IF NOT EXISTS app_profile (
     id              TEXT PRIMARY KEY,
     name            TEXT NOT NULL,
     description     TEXT,
     color           TEXT,
     network_sigs    JSON NOT NULL,
     created_at      TIMESTAMP NOT NULL,
     updated_at      TIMESTAMP NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_name ON app_profile (name)`,
  // Generic singleton key/value store (active_profile_id, auto_switch_enabled,
  // last_detected_signature). Reusable for future app-level settings.
  `CREATE TABLE IF NOT EXISTS app_setting (
     key             TEXT PRIMARY KEY,
     value           JSON NOT NULL
   )`,
  // Associate each service instance with its owning profile. Added idempotently
  // (DDL re-runs every boot); backfilled to the Default profile by the bootstrap
  // step in ensureProfileBootstrap(). Kept nullable at the DB level — requiredness
  // is enforced in the app layer.
  `ALTER TABLE app_service_instance ADD COLUMN IF NOT EXISTS profile_id TEXT`,
];

export async function runConfigMigrations(
  conn: DuckDBConnection
): Promise<void> {
  for (const stmt of STATEMENTS) {
    await conn.run(stmt);
  }
}
