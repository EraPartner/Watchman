import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readOrCreateSecretFile } from "./secretFile.js";
import { loadOrCreateMasterKey } from "./masterKey.js";

const freshDir = () => mkdtempSync(join(tmpdir(), "wm-secret-"));

describe("readOrCreateSecretFile", () => {
  it("creates a missing file (and its directory) with 0600 perms", () => {
    const path = join(freshDir(), "nested", "secret");
    expect(readOrCreateSecretFile(path, () => "s3cret")).toBe("s3cret");
    expect(readFileSync(path, "utf8")).toBe("s3cret");
    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("returns an existing file without calling generate", () => {
    const path = join(freshDir(), "secret");
    writeFileSync(path, "existing", { mode: 0o644 });
    let called = false;
    const out = readOrCreateSecretFile(path, () => {
      called = true;
      return "new";
    });
    expect(out).toBe("existing");
    expect(called).toBe(false);
    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("keeps the file another process created first", () => {
    // Regression for the exists-then-write race: the file appears after the
    // initial read but before the exclusive create.
    const path = join(freshDir(), "secret");
    const out = readOrCreateSecretFile(path, () => {
      writeFileSync(path, "theirs");
      return "mine";
    });
    expect(out).toBe("theirs");
    expect(readFileSync(path, "utf8")).toBe("theirs");
  });
});

describe("loadOrCreateMasterKey", () => {
  it("returns the env override without touching disk", () => {
    expect(loadOrCreateMasterKey(freshDir(), "from-env")).toBe("from-env");
  });

  it("creates a key once and reuses it", () => {
    const dir = freshDir();
    const first = loadOrCreateMasterKey(dir);
    expect(Buffer.from(first, "base64")).toHaveLength(32);
    expect(loadOrCreateMasterKey(dir)).toBe(first);
  });

  it("refuses an empty key file instead of replacing it", () => {
    const dir = freshDir();
    writeFileSync(join(dir, "master.key"), "  \n");
    expect(() => loadOrCreateMasterKey(dir)).toThrow(
      /Master key file is empty/
    );
    expect(readFileSync(join(dir, "master.key"), "utf8")).toBe("  \n");
  });
});
