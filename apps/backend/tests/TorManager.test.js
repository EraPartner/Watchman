import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
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
