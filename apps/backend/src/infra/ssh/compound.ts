/** Delimiter echoed between command outputs in a compound SSH exec. */
export const SSH_SEGMENT_DELIMITER = "@@WATCHMAN_SEGMENT@@";

/**
 * Join independent commands into one remote invocation so a stats cycle
 * costs a single SSH exec instead of one per command. Each segment is
 * isolated in a subshell and failure-tolerant; a failing command simply
 * yields an empty segment.
 */
export function compoundCommand(commands: readonly string[]): string {
  return commands
    .map((c) => `( ${c} ) 2>/dev/null || true`)
    .join(`; echo "${SSH_SEGMENT_DELIMITER}"; `);
}

/** Split compound output back into per-command segments (trimmed; padded
 *  with empty strings so callers can index safely). */
export function splitSegments(stdout: string, count: number): string[] {
  const parts = stdout.split(SSH_SEGMENT_DELIMITER).map((s) => s.trim());
  while (parts.length < count) parts.push("");
  return parts;
}
