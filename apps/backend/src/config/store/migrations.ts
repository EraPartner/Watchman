import type { DuckDBConnection } from '@duckdb/node-api';

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
];

export async function runConfigMigrations(conn: DuckDBConnection): Promise<void> {
  for (const stmt of STATEMENTS) {
    await conn.run(stmt);
  }
}
