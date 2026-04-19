import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DuckDBConnection } from '@duckdb/node-api';

const HERE = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(conn: DuckDBConnection): Promise<void> {
  const sqlPath = join(HERE, 'schema.sql');
  const sql = await readFile(sqlPath, 'utf8');
  const stripComments = (s: string): string =>
    s
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
  const statements = sql
    .split(/;\s*(?:\n|$)/)
    .map(stripComments)
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await conn.run(stmt);
  }
}
