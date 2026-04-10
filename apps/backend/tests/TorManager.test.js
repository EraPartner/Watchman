import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { TorManager } from "../services/TorManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function listenOnRandomPort(host = "127.0.0.1") {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve listening address"));
        return;
      }

      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("TorManager defaults dataDir to backend/.tor-data", () => {
  const manager = new TorManager();
  const expected = path.resolve(__dirname, "..", ".tor-data");

  assert.equal(manager.dataDir, expected);
});

test("TorManager isRunning returns true when SOCKS port is open", async () => {
  const { server, port } = await listenOnRandomPort();
  const manager = new TorManager({ socksPort: port });

  try {
    const running = await manager.isRunning();
    assert.equal(running, true);
  } finally {
    await closeServer(server);
  }
});

test("TorManager isRunning returns false when SOCKS port is closed", async () => {
  const { server, port } = await listenOnRandomPort();
  await closeServer(server);

  const manager = new TorManager({ socksPort: port });
  const running = await manager.isRunning();

  assert.equal(running, false);
});

test("TorManager initialize returns true when Tor is not installed", async () => {
  const manager = new TorManager();
  manager.isInstalled = async () => false;

  const initialized = await manager.initialize();
  assert.equal(initialized, true);
});

test("TorManager initialize checks running state when installed", async () => {
  const managerRunning = new TorManager();
  managerRunning.isInstalled = async () => true;
  managerRunning.isRunning = async () => true;
  assert.equal(await managerRunning.initialize(), true);

  const managerStopped = new TorManager();
  managerStopped.isInstalled = async () => true;
  managerStopped.isRunning = async () => false;
  assert.equal(await managerStopped.initialize(), true);
});

test("TorManager initialize returns false on unexpected error", async () => {
  const manager = new TorManager();
  manager.isInstalled = async () => {
    throw new Error("boom");
  };

  assert.equal(await manager.initialize(), false);
});

test("TorManager startTor returns early when already starting", async () => {
  const manager = new TorManager();
  manager.isStarting = true;

  const result = await manager.startTor();
  assert.equal(result, undefined);
});

test("TorManager startTor returns true when Tor is already running", async () => {
  const manager = new TorManager();
  manager.isRunning = async () => true;

  const result = await manager.startTor();
  assert.equal(result, true);
});

test("TorManager startTor returns false when installation fails", async () => {
  const manager = new TorManager();
  manager.isRunning = async () => false;
  manager.isInstalled = async () => false;
  manager.installTor = async () => false;

  const result = await manager.startTor();

  assert.equal(result, false);
  assert.equal(manager.isStarting, false);
});

test("TorManager createTorConfig creates torrc with expected content", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "watchman-tor-"));
  const manager = new TorManager({
    dataDir: tempDir,
    socksPort: 19050,
    controlPort: 19051,
  });

  try {
    const configPath = await manager.createTorConfig();
    const content = await fs.readFile(configPath, "utf8");

    assert.equal(configPath, path.join(tempDir, "torrc"));
    assert.match(content, /SocksPort 19050/);
    assert.match(content, /ControlPort 19051/);
    assert.match(
      content,
      new RegExp(
        `DataDirectory ${tempDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
      )
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

function createFakeTorProcess({ autoExit = false, exitDelayMs = 0 } = {}) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.exitCode = null;
  proc.killCalls = [];
  proc.kill = (signal) => {
    if (signal === "SIGKILL") {
      proc.killed = true;
    }
    proc.killCalls.push(signal);
    if (autoExit) {
      setTimeout(() => {
        proc.exitCode = 0;
        proc.emit("exit", 0, signal);
      }, exitDelayMs);
    }
    return true;
  };
  return proc;
}

test("TorManager stopTor gracefully shuts down process on exit", async () => {
  const manager = new TorManager();
  const fakeProc = createFakeTorProcess({ autoExit: true, exitDelayMs: 5 });
  manager.torProcess = fakeProc;

  await manager.stopTor();

  assert.equal(manager.torProcess, null);
  assert.deepEqual(fakeProc.killCalls, ["SIGTERM"]);
});

test("TorManager stopTor escalates to SIGKILL when process does not exit", async () => {
  const manager = new TorManager();
  const fakeProc = createFakeTorProcess({ autoExit: false });
  manager.torProcess = fakeProc;

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => originalSetTimeout(fn, 1);

  try {
    await manager.stopTor();
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.equal(manager.torProcess, null);
  assert.deepEqual(fakeProc.killCalls, ["SIGTERM", "SIGKILL"]);
});

test("TorManager cleanup removes torrc and tolerates missing files", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "watchman-tor-clean-")
  );
  const torrcPath = path.join(tempDir, "torrc");
  await fs.writeFile(torrcPath, "test");

  const manager = new TorManager({ dataDir: tempDir });
  let stopCalls = 0;
  manager.stopTor = async () => {
    stopCalls += 1;
  };

  try {
    await manager.cleanup();
    assert.equal(stopCalls, 1);
    await assert.rejects(() => fs.access(torrcPath));

    await manager.cleanup();
    assert.equal(stopCalls, 2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("TorManager checkHealth reports online/offline and managed state", async () => {
  const managerOffline = new TorManager({ socksPort: 9055 });
  managerOffline.isRunning = async () => false;
  managerOffline.torProcess = null;
  const offline = await managerOffline.checkHealth();

  assert.equal(offline.status, "offline");
  assert.equal(offline.port, 9055);
  assert.equal(offline.isManaged, false);

  const managerOnline = new TorManager({ socksPort: 9056 });
  managerOnline.isRunning = async () => true;
  managerOnline.torProcess = createFakeTorProcess();
  const online = await managerOnline.checkHealth();

  assert.equal(online.status, "online");
  assert.equal(online.port, 9056);
  assert.equal(online.isManaged, true);
  assert.equal(typeof online.lastCheck, "string");
});
