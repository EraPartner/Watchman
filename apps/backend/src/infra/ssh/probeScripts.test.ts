import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { compoundCommand } from "./compound.js";
import {
  PI_DYNAMIC_COMMANDS,
  PI_STATIC_COMMANDS,
} from "../../domain/services/raspberryPi/PiStatsCollector.js";
import { MAC_STATS_COMMANDS } from "../../domain/services/macMini/MacMiniService.js";

// The read-only probe scripts in packaging/probes are installed as the SSH
// forced command (authorized_keys `command=`), so sshd runs them instead of
// whatever Watchman sends. They must print exactly what the compound command
// would, or the positional parsers read the wrong segments.
const probe = (name: string): URL =>
  new URL(`../../../../../packaging/probes/${name}`, import.meta.url);

function scriptBody(name: string): string {
  const text = readFileSync(probe(name), "utf8");
  const [, commands] = text.split("# --- commands ---\n");
  return (commands ?? "").trim().split("\n").join(" ");
}

describe("read-only SSH probe scripts", () => {
  it("the Pi probe prints the dynamic then static commands", () => {
    expect(scriptBody("watchman-probe-pi.sh")).toBe(
      compoundCommand([...PI_DYNAMIC_COMMANDS, ...PI_STATIC_COMMANDS])
    );
  });

  it("the Mac probe prints MAC_STATS_COMMANDS", () => {
    expect(scriptBody("watchman-probe-mac.sh")).toBe(
      compoundCommand(MAC_STATS_COMMANDS)
    );
  });

  it("both probes are POSIX sh scripts and executable", () => {
    for (const name of ["watchman-probe-pi.sh", "watchman-probe-mac.sh"]) {
      expect(readFileSync(probe(name), "utf8").startsWith("#!/bin/sh\n")).toBe(true);
      expect(statSync(probe(name)).mode & 0o111).not.toBe(0);
    }
  });
});
