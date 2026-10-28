const FAILURE_BACKOFF_MS = 60_000;

export type TtlMemo<T> = (signal: AbortSignal) => Promise<T>;

/**
 * Memoize an async fetcher with a TTL — the "slow lane" for configuration-
 * grade data (versions, filter lists, preferences) that services would
 * otherwise re-fetch on every stats poll. Concurrent callers share one
 * in-flight fetch; on fetch failure the last known value is served when
 * available (stale-on-error), otherwise the error propagates.
 *
 * A failure is remembered for min(ttl, 60 s): within that window the stale
 * value (or the same error) is returned without calling the fetcher again, so
 * a slow lane that keeps failing is not re-requested on every poll. A fetch
 * that failed because the caller aborted is not remembered.
 */
export function ttlMemo<T>(
  ttlMs: number,
  now: () => number,
  fetcher: (signal: AbortSignal) => Promise<T>
): TtlMemo<T> {
  let value: T | undefined;
  let fetchedAt = Number.NEGATIVE_INFINITY;
  let inflight: Promise<T> | null = null;
  const failureBackoffMs = Math.min(ttlMs, FAILURE_BACKOFF_MS);
  let failure: { error: unknown; at: number } | undefined;

  return async (signal: AbortSignal): Promise<T> => {
    if (value !== undefined && now() - fetchedAt < ttlMs) return value;
    if (failure && now() - failure.at < failureBackoffMs) {
      if (value !== undefined) return value;
      throw failure.error;
    }
    if (!inflight) {
      inflight = fetcher(signal).then(
        (v) => {
          value = v;
          fetchedAt = now();
          failure = undefined;
          inflight = null;
          return v;
        },
        (e: unknown) => {
          inflight = null;
          if (!signal.aborted) failure = { error: e, at: now() };
          if (value !== undefined) return value;
          throw e;
        }
      );
    }
    return inflight;
  };
}
