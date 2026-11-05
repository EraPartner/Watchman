/**
 * Readable text for a value whose type is not known ahead of time, such as a
 * field of a stats payload. Objects and arrays become JSON instead of
 * "[object Object]"; null and undefined become `empty`.
 */
export function toText(v: unknown, empty = "—"): string {
  if (v === null || v === undefined) return empty;
  if (typeof v === "string") return v;
  if (
    typeof v === "number" ||
    typeof v === "boolean" ||
    typeof v === "bigint" ||
    typeof v === "symbol"
  ) {
    return v.toString();
  }
  if (typeof v === "function") return "[function]";
  try {
    return JSON.stringify(v);
  } catch {
    return Object.prototype.toString.call(v);
  }
}
