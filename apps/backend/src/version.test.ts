import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SERVER_VERSION } from "./version.js";

describe("SERVER_VERSION", () => {
  it("matches the backend package.json version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
