import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Expand a leading "~" or "~/" to the user's home directory. Operators type
 * paths like "~/.ssh/id_ed25519" into the service form; fs.readFile does not
 * expand them, so the key "could not be read".
 */
export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}
