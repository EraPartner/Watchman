import { spawn, exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

class TorManager {
  constructor(config = {}) {
    this.torPath = config.torPath || "tor";
    this.socksPort = config.socksPort || 9050;
    this.controlPort = config.controlPort || 9051;
    this.dataDir = config.dataDir || path.join(process.cwd(), ".tor-data");
    this.torProcess = null;
    this.isStarting = false;
    this.startupTimeout = config.startupTimeout || 30000; // 30 seconds
  }

  async initialize() {
    console.log("🔧 Initializing Tor Manager...");

    try {
      // Check if Tor is installed
      const installed = await this.isInstalled();
      if (!installed) {
        console.log("⚠️  Tor is not installed, but manager is ready");
        return true;
      }

      // Check if Tor is already running
      const running = await this.isRunning();
      if (running) {
        console.log("✅ Tor is already running on port", this.socksPort);
      } else {
        console.log("ℹ️  Tor is installed but not running");
      }

      console.log("✅ Tor Manager initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize Tor Manager:", error.message);
      return false;
    }
  }

  async isInstalled() {
    try {
      await execAsync("which tor");
      return true;
    } catch {
      try {
        await execAsync("brew list tor");
        return true;
      } catch {
        return false;
      }
    }
  }

  async installTor() {
    console.log("📦 Installing Tor via Homebrew...");
    try {
      await execAsync("brew install tor");
      console.log("✅ Tor installed successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to install Tor:", error.message);
      return false;
    }
  }

  async isRunning() {
    try {
      // Check if something is listening on the SOCKS port
      const { stdout } = await execAsync(
        `lsof -i :${this.socksPort} | grep LISTEN`
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
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
      console.log("⏳ Tor is already starting...");
      return;
    }

    if (await this.isRunning()) {
      console.log("✅ Tor is already running on port", this.socksPort);
      return true;
    }

    this.isStarting = true;

    try {
      // Check if Tor is installed
      if (!(await this.isInstalled())) {
        console.log("🔧 Tor not found, attempting to install...");
        const installed = await this.installTor();
        if (!installed) {
          throw new Error("Failed to install Tor");
        }
      }

      // Create Tor config
      const configPath = await this.createTorConfig();
      console.log("🚀 Starting Tor with SOCKS proxy on port", this.socksPort);

      // Start Tor process
      this.torProcess = spawn("tor", ["-f", configPath], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      // Handle process events
      this.torProcess.on("error", (error) => {
        console.error("❌ Tor process error:", error.message);
        this.isStarting = false;
      });

      this.torProcess.on("exit", (code, signal) => {
        console.log(
          `🛑 Tor process exited with code ${code}, signal ${signal}`
        );
        this.torProcess = null;
        this.isStarting = false;
      });

      // Log Tor output
      this.torProcess.stdout.on("data", (data) => {
        const output = data.toString();
        if (output.includes("Bootstrapped 100%") || output.includes("Done")) {
          console.log("✅ Tor is ready and running");
        } else if (output.includes("Bootstrapped")) {
          console.log(
            "⏳ Tor bootstrapping...",
            output.match(/Bootstrapped \d+%/)?.[0] || ""
          );
        }
      });

      this.torProcess.stderr.on("data", (data) => {
        const error = data.toString();
        if (!error.includes("Bootstrapped") && !error.includes("notice")) {
          console.error("🔧 Tor:", error.trim());
        }
      });

      // Wait for Tor to start
      const startTime = Date.now();
      while (Date.now() - startTime < this.startupTimeout) {
        if (await this.isRunning()) {
          console.log("✅ Tor proxy is ready on port", this.socksPort);
          this.isStarting = false;
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      throw new Error("Tor startup timeout");
    } catch (error) {
      console.error("❌ Failed to start Tor:", error.message);
      this.isStarting = false;
      await this.stopTor();
      return false;
    }
  }

  async stopTor() {
    if (this.torProcess) {
      console.log("🛑 Stopping Tor process...");
      this.torProcess.kill("SIGTERM");

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        if (this.torProcess) {
          this.torProcess.on("exit", resolve);
          setTimeout(() => {
            if (this.torProcess) {
              this.torProcess.kill("SIGKILL");
              resolve();
            }
          }, 5000);
        } else {
          resolve();
        }
      });

      this.torProcess = null;
    }
  }

  async cleanup() {
    await this.stopTor();
    try {
      await fs.rm(this.dataDir, { recursive: true, force: true });
      console.log("🧹 Cleaned up Tor data directory");
    } catch (error) {
      console.warn("⚠️  Could not clean up Tor data directory:", error.message);
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
