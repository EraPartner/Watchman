import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Roon has no read-only grant: declaring the transport service (needed to
// read zones) lets the extension call play/pause/volume/standby once the user
// enables it. Watchman only subscribes to zones. This guard keeps any
// transport control call out of the Roon code (Watchman is read-only toward
// monitored services, ADR-032).
const SOURCES = [
  "./roonClientImpl.ts",
  "../../domain/services/roon/RoonService.ts",
];

const CONTROL_CALLS = [
  /new\s+RoonApiTransport/,
  /\.control\s*\(/,
  /change_volume/,
  /\bmute(_all)?\s*\(/,
  /pause_all/,
  /\bseek\s*\(/,
  /standby/,
  /convenience_switch/,
  /transfer_zone/,
  /(un)?group_outputs/,
  /change_settings/,
  /send_request\s*\(/,
];

describe("Roon integration stays read-only", () => {
  for (const rel of SOURCES) {
    it(`${rel} makes no transport control call`, () => {
      const src = readFileSync(
        fileURLToPath(new URL(rel, import.meta.url)),
        "utf8"
      );
      // comments may name the methods; only code counts
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, ""))
        .join("\n");
      for (const pattern of CONTROL_CALLS) {
        expect(code, `${rel} matches ${pattern}`).not.toMatch(pattern);
      }
    });
  }
});
