/**
 * True for a number other than 0 and NaN: exactly what `if (n)` accepted for
 * a number, spelled out so the lint rule that forbids numbers in conditions
 * holds without changing behaviour.
 */
export function isNonZero(n: number | null | undefined): n is number {
  return n !== null && n !== undefined && n !== 0 && !Number.isNaN(n);
}
