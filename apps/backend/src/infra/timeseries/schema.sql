-- Watchman time-series schema (DuckDB)
-- One shape across tiers → rollups are pure INSERT ... SELECT time_bucket().

CREATE TABLE IF NOT EXISTS metric_raw (
  ts TIMESTAMP NOT NULL,
  kind VARCHAR NOT NULL,
  instance_id VARCHAR NOT NULL,
  metric VARCHAR NOT NULL,
  value_num DOUBLE,
  value_text VARCHAR,
  value_bool BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_raw_lookup ON metric_raw (kind, instance_id, metric, ts);

CREATE TABLE IF NOT EXISTS metric_1m (
  ts TIMESTAMP NOT NULL,
  kind VARCHAR NOT NULL,
  instance_id VARCHAR NOT NULL,
  metric VARCHAR NOT NULL,
  min_v DOUBLE,
  max_v DOUBLE,
  avg_v DOUBLE,
  last_v DOUBLE,
  sample_count BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_1m_lookup ON metric_1m (kind, instance_id, metric, ts);

CREATE TABLE IF NOT EXISTS metric_5m (
  ts TIMESTAMP NOT NULL,
  kind VARCHAR NOT NULL,
  instance_id VARCHAR NOT NULL,
  metric VARCHAR NOT NULL,
  min_v DOUBLE,
  max_v DOUBLE,
  avg_v DOUBLE,
  last_v DOUBLE,
  sample_count BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_5m_lookup ON metric_5m (kind, instance_id, metric, ts);

CREATE TABLE IF NOT EXISTS metric_1h (
  ts TIMESTAMP NOT NULL,
  kind VARCHAR NOT NULL,
  instance_id VARCHAR NOT NULL,
  metric VARCHAR NOT NULL,
  min_v DOUBLE,
  max_v DOUBLE,
  avg_v DOUBLE,
  last_v DOUBLE,
  sample_count BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_1h_lookup ON metric_1h (kind, instance_id, metric, ts);

-- Rollup state: tracks last bucket processed per tier, so workers resume cleanly.
CREATE TABLE IF NOT EXISTS rollup_state (
  tier VARCHAR PRIMARY KEY,
  last_bucket TIMESTAMP NOT NULL
);
