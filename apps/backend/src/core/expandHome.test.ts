import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandHome } from "./expandHome.js";

describe("expandHome", () => {
  it("expands a leading ~/", () => {
    expect(expandHome("~/.ssh/id_ed25519")).toBe(
      join(homedir(), ".ssh/id_ed25519")
    );
  });

  it("expands a bare ~", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  it("leaves absolute, relative and ~user paths alone", () => {
    expect(expandHome("/etc/tor/cookie")).toBe("/etc/tor/cookie");
    expect(expandHome("keys/id")).toBe("keys/id");
    expect(expandHome("~bob/.ssh/id")).toBe("~bob/.ssh/id");
  });
});
