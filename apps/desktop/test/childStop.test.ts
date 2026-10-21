import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { hasExited, stopChild } from "../src/childStop.ts";

function spawnNode(script: string) {
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const exited = once(child, "exit");
  return { child, exited };
}

// Wait for the child to print "ready" so its signal handlers are installed.
async function ready(child: ReturnType<typeof spawn>): Promise<void> {
  const [chunk] = await once(child.stdout!, "data");
  assert.match(String(chunk), /ready/);
}

test("escalates to SIGKILL when the child ignores SIGTERM", async () => {
  const { child, exited } = spawnNode(
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); console.log('ready')"
  );
  await ready(child);

  await stopChild(child, exited, 200);
  await exited;

  // Regression: escalation was gated on !child.killed, which is already true
  // after the SIGTERM is delivered, so SIGKILL never ran.
  assert.equal(child.signalCode, "SIGKILL");
});

test("does not SIGKILL a child that exits on SIGTERM", async () => {
  const { child, exited } = spawnNode(
    "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000); console.log('ready')"
  );
  await ready(child);

  await stopChild(child, exited, 5000);

  assert.equal(child.exitCode, 0);
  assert.equal(child.signalCode, null);
});

test("is a no-op for a child that already exited", async () => {
  const { child, exited } = spawnNode("process.exit(3)");
  await exited;

  assert.ok(hasExited(child));
  await stopChild(child, exited, 10);
  assert.equal(child.exitCode, 3);
});
