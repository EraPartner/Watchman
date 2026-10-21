import {
  closeSync,
  fchmodSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const SECRET_MODE = 0o600;

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

// Tighten perms through the open descriptor; ignore platforms without POSIX
// perms.
function tightenPerms(fd: number): void {
  try {
    fchmodSync(fd, SECRET_MODE);
  } catch {
    // ignore chmod failure on platforms without POSIX perms
  }
}

function readExisting(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (err) {
    if (errCode(err) === "ENOENT") return null;
    throw err;
  }
  try {
    tightenPerms(fd);
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}

/**
 * Read a secret file, or create it with `generate()` if it doesn't exist.
 * Works on file descriptors (open, then read or exclusive-create) rather than
 * exists-then-read, so there is no check/use window. If another process
 * creates the file first, its contents win. Returns the raw file contents.
 */
export function readOrCreateSecretFile(
  path: string,
  generate: () => string
): string {
  const existing = readExisting(path);
  if (existing !== null) return existing;

  mkdirSync(dirname(path), { recursive: true });
  const contents = generate();
  let fd: number;
  try {
    fd = openSync(path, "wx", SECRET_MODE);
  } catch (err) {
    if (errCode(err) !== "EEXIST") throw err;
    const raced = readExisting(path);
    if (raced === null) throw err;
    return raced;
  }
  try {
    tightenPerms(fd);
    writeFileSync(fd, contents);
  } finally {
    closeSync(fd);
  }
  return contents;
}
