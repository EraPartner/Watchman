import type { ChildProcess } from "child_process";

// `child.killed` turns true as soon as kill() delivers a signal, not when the
// process exits, so liveness has to come from exitCode/signalCode.
export function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

// SIGTERM, wait up to graceMs for `exited`, then SIGKILL if still alive. A
// backend that ignores SIGTERM would otherwise outlive the app and keep the
// DuckDB file locked for the next launch.
export async function stopChild(
  child: ChildProcess,
  exited: Promise<unknown>,
  graceMs: number
): Promise<void> {
  if (hasExited(child)) return;
  child.kill("SIGTERM");
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    exited,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, graceMs);
    }),
  ]);
  clearTimeout(timer);
  if (!hasExited(child)) {
    child.kill("SIGKILL");
  }
}
