import { app, shell } from "electron";
import * as fs from "fs";
import * as path from "path";

let cachedPath: string | undefined;

export function logFilePath(): string {
  if (!cachedPath) {
    cachedPath = path.join(
      app.getPath("userData"),
      "logs",
      "watchman-desktop.log"
    );
  }
  return cachedPath;
}

// Truncate at each launch so the log reflects the current session rather than
// growing unbounded. Best-effort — logging must never break startup.
export function initLogFile(): void {
  try {
    fs.mkdirSync(path.dirname(logFilePath()), { recursive: true });
    fs.writeFileSync(
      logFilePath(),
      `# Watchman desktop — session start ${new Date().toISOString()}\n`
    );
  } catch {
    /* best-effort */
  }
}

export function appendLog(chunk: string): void {
  try {
    fs.appendFileSync(logFilePath(), chunk);
  } catch {
    /* best-effort */
  }
}

// Open the log file in the user's default handler; fall back to revealing the
// logs directory if the file isn't there yet.
export async function openLogs(): Promise<void> {
  try {
    await fs.promises.access(logFilePath());
    await shell.openPath(logFilePath());
  } catch {
    await shell.openPath(path.dirname(logFilePath()));
  }
}
