/**
 * Quote one argument for a POSIX shell (`sh`, `bash`, `zsh`): wrap it in
 * single quotes and close-escape-reopen any single quote inside it.
 */
export function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Like `shellQuote`, but keeps a leading `~/` working by expanding it through
 * `$HOME` on the remote side, since a quoted `~` is not expanded.
 */
export function shellQuotePath(path: string): string {
  if (path === "~") return '"$HOME"';
  if (path.startsWith("~/")) return `"$HOME"/${shellQuote(path.slice(2))}`;
  return shellQuote(path);
}
