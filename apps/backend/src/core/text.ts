/**
 * Text for a value of unknown type, as `String()` would give for strings,
 * numbers, booleans and bigints. null and undefined become `empty`, and
 * objects are JSON instead of "[object Object]".
 */
export function toText(value: unknown, empty = ""): string {
  if (value === null || value === undefined) return empty;
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return value.toString();
  }
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
