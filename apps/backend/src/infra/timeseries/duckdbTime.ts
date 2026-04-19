import { DuckDBTimestampValue } from '@duckdb/node-api';

export const toTs = (d: Date): DuckDBTimestampValue =>
  new DuckDBTimestampValue(BigInt(d.getTime()) * 1000n);
