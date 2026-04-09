import { spawn } from "child_process";
import fs from "fs/promises";
import net from "net";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../middleware/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_TOR_DATA_DIR = path.resolve(__dirname, "..", ".tor-data");

class TorManager {
  constructor(config = {}) {
    this.torPath = config.torPath || "tor";
    this.socksPort = config.socksPort || 9050;
    this.controlPort = config.controlPort || 9051;
    this.dataDir = config.dataDir || DEFAULT_TOR_DATA_DIR;
    this.torProcess = null;
    this.isStarting = false;
    this.startupTimeout = config.startupTimeout || 30000; // 30 seconds
  }

  async initialize() {
    logger.service("tor", "Initializing Tor Manager");

    try {
      // Check if Tor is installed
      const installed = await this.isInstalled();
      if (!installed) {
        logger.warning("Tor is not installed, but manager is ready");
        return true;
      }

      // Check if Tor is already running
      const running = await this.isRunning();
      if (running) {
        logger.service(
          "tor",
          `Tor is already running on port ${this.socksPort}`
        );
      } else {
        logger.service("tor", "Tor is installed but not running");
      }

      logger.service("tor", "Tor Manager initialized successfully");
      return true;
    } catch (error) {
      logger.error("Failed to initialize Tor Manager", {
        error: error.message,
      });
      return false;
    }
  }

  async isInstalled() {
    try {
      const { spawn } = await import("child_process");
      return new Promise((resolve) => {
        const child = spawn("which", ["tor"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.on("close", (code) => {
          if (code === 0) return resolve(true);
          // Fallback: check via brew
          const brew = spawn("brew", ["list", "tor"], {
            stdio: ["ignore", "pipe", "pipe"],
          });
          brew.on("close", (brewCode) => resolve(brewCode === 0));
        });
        child.on("error", () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  async installTor() {
    logger.progress("Installing Tor via Homebrew");
    try {
      const { spawn } = await import("child_process");
      return new Promise((resolve) => {
        const child = spawn("brew", ["install", "tor"], { stdio: "inherit" });
        child.on("close", (code) => {
          if (code === 0) {
            logger.success("Tor installed successfully");
            resolve(true);
          } else {
            logger.error("Failed to install Tor");
            resolve(false);
          }
        });
        child.on("error", () => {
          logger.error("Failed to install Tor");
          resolve(false);
        });
      });
    } catch (error) {
      logger.error("Failed to install Tor", { error: error.message });
      return false;
    }
  }

  async isRunning() {
    return this._isPortOpen(this.socksPort);
  }

  _isPortOpen(port, host = "127.0.0.1", timeout = 1000) {
    return new Promise((resolve) => {
      let socket;
      try {
        socket = net.createConnection({ port, host });
      } catch {
        resolve(false);
        return;
      }
      let settled = false;

      const settle = (isOpen) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        resolve(isOpen);
      };

      socket.setTimeout(timeout);
      socket.once("connect", () => settle(true));
      socket.once("timeout", () => settle(false));
      socket.once("error", () => settle(false));
    });
  }

  async createTorConfig() {
    const configContent = `
# Tor configuration for Watchman
SocksPort ${this.socksPort}
ControlPort ${this.controlPort}
DataDirectory ${this.dataDir}
Log notice stdout
`;

    const configPath = path.join(this.dataDir, "torrc");
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(configPath, configContent.trim());
    return configPath;
  }

  async startTor() {
    if (this.isStarting) {
      logger.progress("Tor is already starting");
      return;
    }

    if (await this.isRunning()) {
      logger.service("tor", `Tor is already running on port ${this.socksPort}`);
      return true;
    }

    this.isStarting = true;

    try {
      // Check if Tor is installed
      if (!(await this.isInstalled())) {
        logger.progress("Tor not found, attempting to install");
        const installed = await this.installTor();
        if (!installed) {
          throw new Error("Failed to install Tor");
        }
      }

      // Create Tor config
      const configPath = await this.createTorConfig();
      logger.service(
        "tor",
        `Starting Tor with SOCKS proxy on port ${this.socksPort}`
      );

      // Start Tor process
      this.torProcess = spawn("tor", ["-f", configPath], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      // Handle process events
      this.torProcess.on("error", (error) => {
        logger.error("Tor process error", { error: error.message });
        this.isStarting = false;
      });

      this.torProcess.on("exit", (code, signal) => {
        logger.service(
          "tor",
          `Tor process exited with code ${code}, signal ${signal}`
        );
        this.torProcess = null;
        this.isStarting = false;
      });

      // Log Tor output
      this.torProcess.stdout.on("data", (data) => {
        const output = data.toString();
        if (output.includes("Bootstrapped 100%") || output.includes("Done")) {
          logger.service("tor", "Tor is ready and running");
        } else if (output.includes("Bootstrapped")) {
          const progress = output.match(/Bootstrapped \d+%/)?.[0] || "";
          logger.progress(`Tor bootstrapping... ${progress}`);
        }
      });

      this.torProcess.stderr.on("data", (data) => {
        const error = data.toString();
        if (!error.includes("Bootstrapped") && !error.includes("notice")) {
          logger.debug(`Tor: ${error.trim()}`);
        }
      });

      // Wait for Tor to start
      const startTime = Date.now();
      let delayMs = 250;
      while (Date.now() - startTime < this.startupTimeout) {
        if (await this.isRunning()) {
          logger.service("tor", `Tor proxy is ready on port ${this.socksPort}`);
          this.isStarting = false;
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * 2, 1000);
      }

      throw new Error("Tor startup timeout");
    } catch (error) {
      logger.error("Failed to start Tor", { error: error.message });
      this.isStarting = false;
      await this.stopTor();
      return false;
    }
  }

  async stopTor() {
    if (this.torProcess) {
      logger.progress("Stopping Tor process");
      const proc = this.torProcess;
      this.torProcess = null;
      proc.kill("SIGTERM");

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        let settled = false;
        proc.once("exit", () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        });
        setTimeout(() => {
          if (!settled) {
            settled = true;
            if (proc.exitCode === null && !proc.killed) {
              proc.kill("SIGKILL");
            }
            resolve();
          }
        }, 5000);
      });
    }
  }

  async cleanup() {
    await this.stopTor();
    try {
      // Only remove the config file, preserve cached consensus/certs for faster restarts
      const torrcPath = path.join(this.dataDir, "torrc");
      await fs.unlink(torrcPath).catch(() => {});
      logger.success("Cleaned up Tor configuration");
    } catch (error) {
      logger.warning(`Could not clean up Tor data directory: ${error.message}`);
    }
  }

  // Health check method
  async checkHealth() {
    const isRunning = await this.isRunning();
    return {
      status: isRunning ? "online" : "offline",
      port: this.socksPort,
      isManaged: !!this.torProcess,
      lastCheck: new Date().toISOString(),
    };
  }
}

export { TorManager };
