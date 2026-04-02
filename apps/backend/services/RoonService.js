import { pingHost } from "../utils/ping.js";
import logger from "../middleware/logger.js";

class RoonService {
  constructor(options = {}) {
    this.host = options.host || process.env.ROON_HOST || null;
    // Accept comma-separated ports via env or options
    const portsEnv = options.ports ?? process.env.ROON_PORTS ?? "";
    // Normalize ports source to either an array or a comma-separated string
    const portsSource = Array.isArray(portsEnv)
      ? portsEnv
      : typeof portsEnv === "number"
        ? String(portsEnv)
        : String(portsEnv || "");
    this.ports = Array.isArray(portsSource)
      ? portsSource.map((p) => parseInt(p, 10)).filter(Boolean)
      : String(portsSource)
          .split(",")
          .map((p) => parseInt(p, 10))
          .filter(Boolean);

    // Default to an empty array (no ports to check) unless provided
    if (this.ports.length === 0) {
      this.ports = options.defaultPorts || [
        (process.env.ROON_DEFAULT_PORT &&
          parseInt(process.env.ROON_DEFAULT_PORT)) ||
          9100,
      ];
    }

    this.timeout = parseInt(
      options.timeout || process.env.ROON_TIMEOUT || "3000",
      10
    );
    this.pingCount = parseInt(
      options.pingCount || process.env.ROON_PING_COUNT || "2",
      10
    );
    // Ensure boolean/string/environment values for usePing are parsed correctly
    this.usePing =
      typeof options.usePing === "boolean"
        ? options.usePing
        : String(options.usePing ?? process.env.ROON_USE_PING ?? "true") ===
          "true";

    this.lastData = null;
  }

  async pingHost() {
    if (!this.host) throw new Error("ROON_HOST not configured");
    try {
      const result = await pingHost(this.host, {
        timeout: this.timeout,
        pingCount: this.pingCount,
      });
      return {
        success: result.success,
        stdout: result.success ? `Ping succeeded (${result.avgMs}ms avg)` : "",
        stderr: result.success ? "" : "Ping failed or timed out",
      };
    } catch (error) {
      return {
        success: false,
        stdout: "",
        stderr: error.message || "Ping failed",
      };
    }
  }

  checkPort(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let done = false;

      socket.setTimeout(this.timeout);

      socket.once("connect", () => {
        done = true;
        socket.destroy();
        resolve({ port, open: true });
      });

      socket.once("timeout", () => {
        if (!done) {
          done = true;
          socket.destroy();
          resolve({ port, open: false });
        }
      });

      socket.once("error", () => {
        if (!done) {
          done = true;
          socket.destroy();
          resolve({ port, open: false });
        }
      });

      try {
        socket.connect(port, this.host);
      } catch (err) {
        if (!done) {
          done = true;
          socket.destroy();
          resolve({ port, open: false });
        }
      }
    });
  }

  async checkHealth() {
    if (!this.host) {
      return {
        status: "offline",
        error: "ROON_HOST not configured",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const pingResultRaw = this.usePing ? await this.pingHost() : null;
      // Normalize ping result to a boolean and keep raw output for debugging
      let pingResult = null;
      let pingOutput = null;

      if (this.usePing) {
        if (pingResultRaw && typeof pingResultRaw === "object") {
          pingResult = Boolean(pingResultRaw.success);
          // prefer stdout, but fall back to stderr -- if both empty provide diagnostic
          pingOutput =
            pingResultRaw.stdout && pingResultRaw.stdout.trim()
              ? pingResultRaw.stdout.trim()
              : pingResultRaw.stderr && pingResultRaw.stderr.trim()
                ? pingResultRaw.stderr.trim()
                : "No ping output";
        } else if (typeof pingResultRaw === "boolean") {
          pingResult = pingResultRaw;
          pingOutput = null;
        } else {
          // ping was intended but we didn't get a usable result — treat as failure
          pingResult = false;
          pingOutput = "Ping check unavailable";
        }
      } else {
        // Ping disabled explicitly
        pingResult = null;
        pingOutput = null;
      }

      // Check ports in parallel
      const portChecks = await Promise.all(
        this.ports.map((p) => this.checkPort(p))
      );

      const anyPortOpen = portChecks.some((p) => p.open === true);

      // Consider the host online if EITHER ping succeeds OR any configured port is open.
      // Previously the code required both ping AND an open port which caused hosts
      // that block ICMP (but have open TCP ports) to be reported offline.
      let isOnline;
      if (this.usePing) {
        isOnline =
          Boolean(pingResult) ||
          anyPortOpen ||
          !this.ports ||
          this.ports.length === 0;
      } else {
        isOnline = anyPortOpen || !this.ports || this.ports.length === 0;
      }

      const result = {
        status: isOnline ? "online" : "offline",
        timestamp: new Date().toISOString(),
        data: {
          host: this.host,
          ping: pingResult,
          pingOutput: pingOutput,
          ports: portChecks,
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

  async getStats() {
    // For now, stats are identical to health; future expansion possible
    const health = await this.checkHealth();
    return {
      ...health,
      lastUpdated: new Date().toISOString(),
    };
  }

  disconnect() {
    // Nothing to disconnect for simple checks
  }
}

export default RoonService;
