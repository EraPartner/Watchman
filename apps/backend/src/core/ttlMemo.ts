export type TtlMemo<T> = (signal: AbortSignal) => Promise<T>;

/**
 * Memoize an async fetcher with a TTL — the "slow lane" for configuration-
 * grade data (versions, filter lists, preferences) that services would
 * otherwise re-fetch on every stats poll. Concurrent callers share one
 * in-flight fetch; on fetch failure the last known value is served when
 * available (stale-on-error), otherwise the error propagates.
 */
export function ttlMemo<T>(
  ttlMs: number,
  now: () => number,
  fetcher: (signal: AbortSignal) => Promise<T>
): TtlMemo<T> {
  let value: T | undefined;
  let fetchedAt = Number.NEGATIVE_INFINITY;
  let inflight: Promise<T> | null = null;

  return async (signal: AbortSignal): Promise<T> => {
    if (value !== undefined && now() - fetchedAt < ttlMs) return value;
    if (!inflight) {
      inflight = fetcher(signal).then(
        (v) => {
          value = v;
          fetchedAt = now();
          inflight = null;
          return v;
        },
        (e: unknown) => {
          inflight = null;
          if (value !== undefined) return value;
          throw e;
        }
      );
    }
    return inflight;
  };
}
