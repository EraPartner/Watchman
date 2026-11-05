/**
 * Minimal reader for the Prometheus text exposition format, enough to pick a
 * few counters/gauges out of a service's own read-only metrics endpoint
 * (Kubo /debug/metrics/prometheus, Tor MetricsPort). Comment lines are
 * skipped, labels are ignored and samples of the same metric name are summed.
 * Unparseable lines are skipped rather than failing the whole read.
 */
export function sumPrometheusSamples(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const m = line.match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})?\s+(\S+)(?:\s+\S+)?$/
    );
    if (!m || !m[1] || m[3] === undefined) continue;
    const value = Number(m[3]);
    if (!Number.isFinite(value)) continue;
    out.set(m[1], (out.get(m[1]) ?? 0) + value);
  }
  return out;
}

/** Samples whose metric name starts with `prefix`, summed per name. */
export function pickPrometheusPrefix(
  samples: Map<string, number>,
  prefix: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of samples) {
    if (name.startsWith(prefix)) out[name] = value;
  }
  return out;
}
