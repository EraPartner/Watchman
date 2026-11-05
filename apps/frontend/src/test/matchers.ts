import { expect } from "vitest";

/**
 * `expect.any(String)` typed as `unknown` instead of `any`, so an object
 * literal that holds it stays type-checked.
 */
export function anyString(): unknown {
  return expect.any(String);
}
