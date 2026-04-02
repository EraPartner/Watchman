import { spawn } from "child_process";
import { Client } from "ssh2";
import fs from "fs";
import logger from "../middleware/logger.js";
import { isSafePath } from "../utils/validation.js";
import { pingHost as sharedPingHost } from "../utils/ping.js";

const ALLOWED_COMMANDS = new Set(["uptime", "df", "osx-cpu-temp", "which"]);

class MacMiniService {
  constructor(options = {}) {
    // host may be provided directly or via env var MACMINI_HOST
    this.host = options.host || process.env.MACMINI_HOST || null;

    // Optional SSH credentials to fetch detailed stats
    this.sshUser = options.sshUser || process.env.MACMINI_SSH_USER || null;
    this.sshPort =
      options.sshPort || parseInt(process.env.MACMINI_SSH_PORT || "22", 10);
    // Accept either MACMINI_SSH_KEY or MACMINI_SSH_KEY_PATH (existing .env uses MACMINI_SSH_KEY_PATH)
    this.sshKey =
      options.sshKey ||
      process.env.MACMINI_SSH_KEY ||
      process.env.MACMINI_SSH_KEY_PATH ||
      null;
    // Accept password/passphrase from options or env. By default treat this as the private-key passphrase.
    this.sshPassword =
      options.sshPassword || process.env.MACMINI_SSH_PASSWORD || null;
    // If you explicitly want to use password authentication (not passphrase), set MACMINI_SSH_USE_PASSWORD=true
    this.sshUsePassword =
      typeof options.sshUsePassword === "boolean"
        ? options.sshUsePassword
        : String(process.env.MACMINI_SSH_USE_PASSWORD || "").toLowerCase() ===
          "true";

    this.timeout = parseInt(
      options.timeout || process.env.MACMINI_TIMEOUT || "5000",
      10
    );

    // If we have sshUser and host, we'll attempt SSH-based stats
    this.useSSH = !!(this.host && this.sshUser);

    // Only treat as password auth when explicitly requested; otherwise use as key passphrase
    this.usePassword = !!(this.sshUsePassword && this.sshPassword);

    this.lastData = null;

    // Cache SSH key at startup
    if (this.sshKey) {
      try {
        this._cachedSshKey = fs.readFileSync(this.sshKey, "utf8");
      } catch (err) {
        this._cachedSshKey = null;
      }
    }
  }

  #isCommandAllowed(cmd) {
    const base = cmd.split(/\s+/)[0];
    return ALLOWED_COMMANDS.has(base);
  }

  // Try multiple ping strategies via shared utility
  async pingHost() {
    if (!this.host) throw new Error("MACMINI_HOST not configured");
    return sharedPingHost(this.host, { timeout: this.timeout });
  }

  // Run command via system SSH using spawn (no shell interpolation)
  async _runSshViaSpawn(cmd) {
    if (!this.useSSH) throw new Error("SSH not configured for Mac Mini");

    // Validate host before building SSH args
    if (!isValidIPv4(this.macMiniHost) && !isValidHostname(this.macMiniHost)) {
      throw new Error(`Invalid MACMINI_HOST: ${this.macMiniHost}`);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const sshArgs = [
        "-o",
        "BatchMode=yes",
        "-p",
        String(this.sshPort),
        ...(this.sshKey ? ["-i", this.sshKey] : []),
        `${this.sshUser}@${this.host}`,
        cmd,
      ];

      const child = spawn("ssh", sshArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: this.timeout + 3000,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (!settled) {
          settled = true;
          if (code !== 0) {
            reject(new Error(`ssh exited with code ${code}: ${stderr.trim()}`));
          } else {
            resolve({ stdout, stderr });
          }
        }
      });

      child.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });
  }

  // New helper: run a command using ssh2 (password or key supported)
  runCmdOverSsh2(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.useSSH)
        return reject(new Error("SSH not configured for Mac Mini"));

      const conn = new Client();
      const connectionOpts = {
        host: this.host,
        port: this.sshPort,
        username: this.sshUser,
        readyTimeout: this.timeout + 2000,
      };

      // Prefer key + passphrase (non-interactive) when possible. If an SSH agent socket is present, prefer agent.
      const hasAgent = !!process.env.SSH_AUTH_SOCK;

      if (hasAgent) {
        // If agent exists, prefer agent-based auth
        connectionOpts.agent = process.env.SSH_AUTH_SOCK;
        connectionOpts.agentForward = true;
      }

      if (this.sshKey) {
        // SECURITY: Validate SSH key path to prevent path traversal attacks
        if (!isSafePath(this.sshKey)) {
          return reject(
            new Error("Invalid SSH key path: path traversal not allowed")
          );
        }

        try {
          // read key and provide passphrase (if available) so ssh2 can unlock it non-interactively
          connectionOpts.privateKey =
            this._cachedSshKey || fs.readFileSync(this.sshKey, "utf8");
          if (this.sshPassword && !this.sshUsePassword) {
            // treat sshPassword as key passphrase
            connectionOpts.passphrase = this.sshPassword;
          }
        } catch (err) {
          if (!hasAgent)
            return reject(
              new Error(
                "Failed to read private key for ssh2: " + (err.message || err)
              )
            );
        }
      }

      // If explicit password-auth was requested, use it as a fallback
      if (this.usePassword && this.sshPassword) {
        connectionOpts.password = this.sshPassword;
      }

      let stdout = "";
      let stderr = "";
      let finished = false;

      conn
        .on("ready", () => {
          conn.exec(cmd, { timeout: this.timeout + 3000 }, (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }
            stream
              .on("close", (code, signal) => {
                finished = true;
                conn.end();
                if (code !== 0) {
                  return reject(
                    new Error(
                      `Command exited with code ${code}: ${stderr.trim()}`
                    )
                  );
                }
                resolve({ stdout, stderr, code, signal });
              })
              .on("data", (data) => {
                stdout += data.toString();
              })
              .stderr.on("data", (data) => {
                stderr += data.toString();
              });
          });
        })
        .on("error", (err) => {
          if (!finished) reject(err);
        })
        .connect(connectionOpts);
    });
  }

  async checkHealth() {
    if (!this.host) {
      return {
        status: "offline",
        error: "MACMINI_HOST not configured",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const pingResult = await this.pingHost();
      const isOnline = Boolean(pingResult.success);

      const result = {
        status: isOnline ? "online" : "offline",
        timestamp: new Date().toISOString(),
        data: {
          host: this.host,
          ping: isOnline,
          pingOutput:
            pingResult.stdout && pingResult.stdout.trim()
              ? pingResult.stdout.trim()
              : pingResult.stderr && pingResult.stderr.trim()
                ? pingResult.stderr.trim()
                : null,
        },
      };

      this.lastData = result;
      return result;
    } catch (error) {
      return {
        status: "error",
        error: error.message,
        lastData: this.lastData,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Modified runRemoteCommand: use ssh2 password auth when available, otherwise prefer agent/key or fallback to system ssh
  async runRemoteCommand(cmd) {
    if (!this.useSSH) throw new Error("SSH not configured for Mac Mini");

    // Prefer ssh2 with key/passphrase or agent. Only use explicit password auth when requested.
    try {
      // If we have a key (with optional passphrase) or agent, try ssh2
      if (this.sshKey || process.env.SSH_AUTH_SOCK) {
        const res = await this.runCmdOverSsh2(cmd);
        return { stdout: res.stdout || "", stderr: res.stderr || "" };
      }
    } catch (e) {
      // If ssh2 with key/agent failed, and explicit password auth is enabled, try that
      if (!this.usePassword) {
        // fall through to system ssh fallback
      } else {
        try {
          const res = await this.runCmdOverSsh2(cmd);
          return { stdout: res.stdout || "", stderr: res.stderr || "" };
        } catch (err) {
          // continue to system fallback
        }
      }
    }

    // Final fallback: system ssh via spawn
    const { stdout, stderr } = await this._runSshViaSpawn(cmd);
    return { stdout: stdout || "", stderr: stderr || "" };
  }

  // Fetch stats: cpu load via uptime, disk via df, cpu temp via osx-cpu-temp if available
  async getStats() {
    // If we can't SSH, return minimal object indicating SSH not configured
    if (!this.useSSH) {
      return {
        message:
          "SSH not configured; only health checks via ping are available",
      };
    }

    try {
      // Get uptime / load info
      const { stdout: uptimeOut } = await this.runRemoteCommand("uptime");
      // Get disk usage for root
      const { stdout: dfOut } = await this.runRemoteCommand("df -k /");
      // Try to get CPU temp using osx-cpu-temp if installed
      let cpuTemp = null;
      try {
        // Ensure common Homebrew locations are in PATH for non-interactive ssh shells
        const tempCmd =
          'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; which osx-cpu-temp && osx-cpu-temp';
        const { stdout: tempOut } = await this.runRemoteCommand(tempCmd);
        const t = (tempOut || "").trim().split(/\s+/).pop();
        if (t) cpuTemp = t.replace(/[^0-9.]/g, "");
      } catch (e) {
        cpuTemp = null;
      }

      // Parse load average from uptime output
      // Example mac uptime: 15:04  up 1 day,  3:12, 3 users, load averages: 1.23 0.87 0.65
      // Example linux uptime:  15:04:31 up 10 days,  5:03,  2 users,  load average: 0.00, 0.01, 0.05
      let cpuLoad = null;
      const loadMatch =
        uptimeOut && uptimeOut.match(/load averages?:?\s*([0-9.,\s]+)/i);
      if (loadMatch && loadMatch[1]) {
        const parts = loadMatch[1]
          .split(/[ ,]+/)
          .map((p) => p.trim())
          .filter(Boolean);
        cpuLoad = parts[0] ? `${parseFloat(parts[0]).toFixed(2)}` : null;
      } else {
        // fallback: try to extract last 1-min load via awk
        cpuLoad = null;
      }

      // Parse df output for root filesystem (re-added)
      // df -k gives 1K-blocks; header then a line like: /dev/disk1s5  488245288 12345678  475000000  3% /
      const dfLines = (dfOut || "")
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      let disk = null;
      if (dfLines.length >= 2) {
        const cols = dfLines[1].split(/\s+/);
        // typical columns: Filesystem, 1K-blocks, Used, Available, Capacity, Mounted on
        const totalK = parseInt(cols[1] || cols[0], 10);
        const usedK = parseInt(cols[2] || "0", 10);
        const availK = parseInt(cols[3] || "0", 10);
        if (!Number.isNaN(totalK)) {
          const total = totalK * 1024;
          const used = Number.isNaN(usedK) ? 0 : usedK * 1024;
          const free = Number.isNaN(availK) ? 0 : availK * 1024;
          const usagePercent =
            total > 0 ? Math.round((used / total) * 100) : null;
          disk = { total, used, free, usagePercent };
        }
      }

      const uptimeSeconds = parseUptimeSeconds(
        uptimeOut ? uptimeOut.trim() : null
      );

      const stats = {
        cpuLoad: cpuLoad !== null ? parseFloat(cpuLoad) : null,
        cpuTemp: cpuTemp !== null ? parseFloat(cpuTemp) : null,
        // disk object included again
        disk,
        uptime: typeof uptimeSeconds === "number" ? uptimeSeconds : null,
        uptimeRaw: uptimeOut ? uptimeOut.trim() : null,
        lastUpdated: new Date().toISOString(),
      };

      this.lastData = stats;
      return stats;
    } catch (error) {
      return {
        error: error.message,
        message: "Failed to fetch stats over SSH",
        lastData: this.lastData,
      };
    }
  }

  disconnect() {
    // nothing to cleanup
  }
}

export default MacMiniService;

function parseUptimeSeconds(uptime) {
  if (!uptime) return null;

  // Example formats:
  //  15:04  up 1 day,  3:12, 3 users, load averages: 1.23 0.87 0.65
  //  15:04:31 up 10 days,  5:03,  2 users,  load average: 0.00, 0.01, 0.05
  //  up 5 minutes
  //  up 3 hours

  const daysMatch = uptime.match(/up\s+(\d+)\s+day/i);
  const hoursMatch = uptime.match(/up\s+(\d+):(\d+)(?::(\d+))?\s+/);
  const minutesMatch = uptime.match(/up\s+(\d+)\s+minutes?/i);
  const hoursTextMatch = uptime.match(/up\s+(\d+)\s+hours?/i);

  let seconds = 0;

  if (daysMatch) {
    seconds += parseInt(daysMatch[1], 10) * 86400; // 24 * 60 * 60
  }

  if (hoursMatch) {
    seconds += parseInt(hoursMatch[1], 10) * 3600; // 60 * 60
    seconds += parseInt(hoursMatch[2] || "0", 10) * 60;
  }

  if (hoursTextMatch) {
    seconds += parseInt(hoursTextMatch[1], 10) * 3600;
  }

  if (minutesMatch) {
    seconds += parseInt(minutesMatch[1], 10) * 60;
  }

  return seconds > 0 ? seconds : null;
}
