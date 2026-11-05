/**
 * Returns `value` when it is present and fails the test otherwise. Tests use
 * it instead of a non-null assertion (`!`), so a missing element or call
 * fails with a clear message rather than a TypeError further down.
 */
export function required<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }
  return value;
}
