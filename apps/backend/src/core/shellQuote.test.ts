import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { shellQuote, shellQuotePath } from "./shellQuote.js";

// Run the quoted words through a real sh and read back what it parsed.
function shWords(cmdline: string): string[] {
  const out = execFileSync(
    "sh",
    ["-c", `for a in ${cmdline}; do printf '%s\\0' "$a"; done`],
    { env: { ...process.env, HOME: "/home/tester" } }
  ).toString();
  return out.split("\0").slice(0, -1);
}

describe("shellQuote", () => {
  it.each([
    "/usr/local/bin/node",
    "/opt/my tools/cli.js",
    "it's",
    "$(touch /tmp/pwned)",
    "a; rm -rf /",
    "`id`",
    "",
  ])("passes %j through sh as one literal word", (arg) => {
    expect(shWords(shellQuote(arg))).toEqual([arg]);
  });
});

describe("shellQuotePath", () => {
  it("expands a leading ~/ through $HOME", () => {
    expect(shWords(shellQuotePath("~/bin/rpi cli.js"))).toEqual([
      "/home/tester/bin/rpi cli.js",
    ]);
    expect(shWords(shellQuotePath("~"))).toEqual(["/home/tester"]);
  });

  it("quotes everything else literally", () => {
    expect(shWords(shellQuotePath("/x/$(id)"))).toEqual(["/x/$(id)"]);
    expect(shWords(shellQuotePath("~user/x"))).toEqual(["~user/x"]);
  });
});
