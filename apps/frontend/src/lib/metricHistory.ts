import { useSyncExternalStore } from "react";

/**
 * Client-side metric history. Keeps the last N samples per
 * (kind, instanceId, metricKey) in memory while the dashboard is open.
 * Data is intentionally non-persistent — ADR-019 reverted server-side
 * history. Resets on reload.
 */

export interface MetricSample {
  t: number;
  v: number;
}

interface SeriesEntry {
  samples: MetricSample[];
  lastT: number;
}

export const HISTORY_CAPACITY = 60;

const series = new Map<string, SeriesEntry>();
const listeners = new Set<() => void>();

function seriesKey(
  kind: string,
  instanceId: string | undefined,
  metricKey: string
): string {
  return `${kind}::${instanceId ?? "main"}::${metricKey}`;
}

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // swallow listener errors so one bad subscriber can't break others
    }
  });
}

function dotGet(obj: unknown, path: string): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Record a stats snapshot — extracts numeric values for every metric path
 * present and appends a new sample. Skips snapshots with the same `at`
 * timestamp to avoid duplicate samples on background polling.
 */
export function recordStats(
  kind: string,
  instanceId: string | undefined,
  stats: Record<string, unknown> | undefined,
  metricPaths: ReadonlyArray<string>,
  snapshotAt: number
): void {
  if (!stats || metricPaths.length === 0) return;
  if (!Number.isFinite(snapshotAt)) return;

  let mutated = false;
  for (const path of metricPaths) {
    const raw = dotGet(stats, path);
    const num = coerceNumber(raw);
    if (num === undefined) continue;

    const k = seriesKey(kind, instanceId, path);
    const existing = series.get(k);
    if (existing && existing.lastT === snapshotAt) continue;

    const nextSamples = existing
      ? [...existing.samples, { t: snapshotAt, v: num }]
      : [{ t: snapshotAt, v: num }];
    if (nextSamples.length > HISTORY_CAPACITY) {
      nextSamples.splice(0, nextSamples.length - HISTORY_CAPACITY);
    }
    series.set(k, { samples: nextSamples, lastT: snapshotAt });
    mutated = true;
  }
  if (mutated) notify();
}

const EMPTY_SERIES: ReadonlyArray<MetricSample> = Object.freeze([]);

export function getSeries(
  kind: string,
  instanceId: string | undefined,
  metricKey: string
): ReadonlyArray<MetricSample> {
  return series.get(seriesKey(kind, instanceId, metricKey))?.samples ?? EMPTY_SERIES;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Subscribe to a single metric series. Returns the current snapshot;
 * re-renders when new samples are appended for any metric. Cheap because
 * series.get returns a stable reference per metric until updated.
 */
export function useMetricSeries(
  kind: string,
  instanceId: string | undefined,
  metricKey: string
): ReadonlyArray<MetricSample> {
  return useSyncExternalStore(
    subscribe,
    () => getSeries(kind, instanceId, metricKey),
    () => EMPTY_SERIES
  );
}

/** Test-only: clear all recorded series. */
export function _resetMetricHistoryForTests(): void {
  series.clear();
  notify();
}
