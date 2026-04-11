import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { TorManager } from "../services/TorManager.js";
import logger from "../middleware/logger.js";

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

async function createFakeTorExecutable({ opensSocksPort }) {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "watchman-fake-tor-"));
  const torBinaryPath = path.join(binDir, "tor");

  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const net = require("node:net");

const opensPort = ${opensSocksPort ? "true" : "false"};
const configArgIndex = process.argv.indexOf("-f");
const configPath = configArgIndex >= 0 ? process.argv[configArgIndex + 1] : undefined;

let socksPort = 0;
if (configPath && fs.existsSync(configPath)) {
  const configContent = fs.readFileSync(configPath, "utf8");
  const match = configContent.match(/SocksPort\\s+(\\d+)/);
  if (match) {
    socksPort = Number(match[1]);
  }
}

let server;
if (opensPort && socksPort > 0) {
  server = net.createServer();
  server.listen(socksPort, "127.0.0.1");
}

const shutdown = () => {
  if (server) {
    server.close(() => process.exit(0));
    return;
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
setInterval(() => {}, 1000);
`;

  await fs.writeFile(torBinaryPath, script, { mode: 0o755 });
  await fs.chmod(torBinaryPath, 0o755);

  return {
    binDir,
    cleanup: () => fs.rm(binDir, { recursive: true, force: true }),
  };
}

async function createFakeCommand(binDir, name, body) {
  const filePath = path.join(binDir, name);
  const script = `#!/usr/bin/env sh
${body}
`;
  await fs.writeFile(filePath, script, { mode: 0o755 });
  await fs.chmod(filePath, 0o755);
  return filePath;
}

async function withFakePath(commands, run) {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "watchman-fake-bin-"));
  const originalPath = process.env.PATH;

  try {
    for (const [name, body] of Object.entries(commands)) {
      await createFakeCommand(binDir, name, body);
    }
    process.env.PATH = `${binDir}:${originalPath || ""}`;
    return await run();
  } finally {
    process.env.PATH = originalPath;
    await fs.rm(binDir, { recursive: true, force: true });
  }
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

test("TorManager isInstalled falls back to brew when which fails", async () => {
  await withFakePath(
    {
      which: "exit 1",
      brew: 'if [ "$1" = "list" ] && [ "$2" = "tor" ]; then exit 0; fi; exit 1',
    },
    async () => {
      const manager = new TorManager();
      const installed = await manager.isInstalled();
      assert.equal(installed, true);
    }
  );
});

test("TorManager installTor returns true on successful brew install", async () => {
  await withFakePath(
    {
      brew: 'if [ "$1" = "install" ] && [ "$2" = "tor" ]; then exit 0; fi; exit 1',
    },
    async () => {
      const manager = new TorManager();
      const installed = await manager.installTor();
      assert.equal(installed, true);
    }
  );
});

test("TorManager installTor returns false on failed brew install", async () => {
  await withFakePath(
    {
      brew: "exit 1",
    },
    async () => {
      const manager = new TorManager();
      const installed = await manager.installTor();
      assert.equal(installed, false);
    }
  );
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

test("TorManager startTor returns true when spawned Tor opens SOCKS port", async () => {
  const fakeTor = await createFakeTorExecutable({ opensSocksPort: true });
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "watchman-tor-start-")
  );
  const originalPath = process.env.PATH;
  process.env.PATH = `${fakeTor.binDir}:${originalPath || ""}`;

  const manager = new TorManager({
    socksPort: 19150,
    controlPort: 19151,
    dataDir: tempDir,
    startupTimeout: 3000,
  });
  manager.isInstalled = async () => true;

  try {
    const result = await manager.startTor();
    assert.equal(result, true);
    assert.equal(manager.isStarting, false);
    assert.ok(manager.torProcess);
  } finally {
    await manager.stopTor();
    process.env.PATH = originalPath;
    await fakeTor.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("TorManager startTor returns false on startup timeout and stops process", async () => {
  const fakeTor = await createFakeTorExecutable({ opensSocksPort: false });
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "watchman-tor-timeout-")
  );
  const originalPath = process.env.PATH;
  const originalSetTimeout = global.setTimeout;

  process.env.PATH = `${fakeTor.binDir}:${originalPath || ""}`;
  global.setTimeout = (fn, _ms, ...args) => originalSetTimeout(fn, 1, ...args);

  const manager = new TorManager({
    socksPort: 19160,
    controlPort: 19161,
    dataDir: tempDir,
    startupTimeout: 20,
  });
  manager.isInstalled = async () => true;

  try {
    const result = await manager.startTor();
    assert.equal(result, false);
    assert.equal(manager.isStarting, false);
    assert.equal(manager.torProcess, null);
  } finally {
    global.setTimeout = originalSetTimeout;
    process.env.PATH = originalPath;
    await manager.stopTor();
    await fakeTor.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("TorManager startTor handles Tor stdout/stderr bootstrapping logs", async () => {
  const fakeTor = await createFakeTorExecutable({ opensSocksPort: true });
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "watchman-tor-logs-")
  );
  const originalPath = process.env.PATH;
  process.env.PATH = `${fakeTor.binDir}:${originalPath || ""}`;

  const progressCalls = [];
  const serviceCalls = [];
  const debugCalls = [];
  const originalProgress = logger.progress;
  const originalService = logger.service;
  const originalDebug = logger.debug;

  logger.progress = (...args) => {
    progressCalls.push(args);
  };
  logger.service = (...args) => {
    serviceCalls.push(args);
  };
  logger.debug = (...args) => {
    debugCalls.push(args);
  };

  const manager = new TorManager({
    socksPort: 19170,
    controlPort: 19171,
    dataDir: tempDir,
    startupTimeout: 3000,
  });
  manager.isInstalled = async () => true;

  try {
    const result = await manager.startTor();
    assert.equal(result, true);
    assert.ok(manager.torProcess);

    manager.torProcess.stdout.emit("data", Buffer.from("Bootstrapped 45%\n"));
    manager.torProcess.stdout.emit(
      "data",
      Buffer.from("Bootstrapped 100%: Done\n")
    );
    manager.torProcess.stderr.emit("data", Buffer.from("notice something\n"));
    manager.torProcess.stderr.emit("data", Buffer.from("fatal problem\n"));
    manager.torProcess.emit("error", new Error("tor process crash"));

    assert.equal(
      progressCalls.some((call) =>
        String(call[0]).includes("Tor bootstrapping... Bootstrapped 45%")
      ),
      true
    );
    assert.equal(
      serviceCalls.some(
        (call) => call[0] === "tor" && call[1] === "Tor is ready and running"
      ),
      true
    );
    assert.equal(
      debugCalls.some((call) => String(call[0]).includes("Tor: fatal problem")),
      true
    );
    assert.equal(manager.isStarting, false);
  } finally {
    logger.progress = originalProgress;
    logger.service = originalService;
    logger.debug = originalDebug;
    await manager.stopTor();
    process.env.PATH = originalPath;
    await fakeTor.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

test("TorManager cleanup logs warning when success logging throws", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "watchman-tor-clean-")
  );
  const torrcPath = path.join(tempDir, "torrc");
  await fs.writeFile(torrcPath, "test");

  const manager = new TorManager({ dataDir: tempDir });
  manager.stopTor = async () => {};

  const warningCalls = [];
  const originalWarning = logger.warning;
  const originalSuccess = logger.success;
  logger.warning = (...args) => {
    warningCalls.push(args);
  };
  logger.success = () => {
    throw new Error("logger failure");
  };

  try {
    await manager.cleanup();
    assert.equal(
      warningCalls.some((call) =>
        String(call[0]).includes("Could not clean up Tor data directory")
      ),
      true
    );
  } finally {
    logger.warning = originalWarning;
    logger.success = originalSuccess;
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
