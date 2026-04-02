import { pingHost } from "../utils/ping.js";

class PhilipsBridgeService {
  constructor(options = {}) {
    this.host = options.host || process.env.PHILIPS_BRIDGE_HOST || null;
    this.pingCount = parseInt(
      options.pingCount || process.env.PHILIPS_PING_COUNT || "2",
      10
    );
    this.timeout = parseInt(
      options.timeout || process.env.PHILIPS_TIMEOUT || "3000",
      10
    );
    this.usePing =
      typeof options.usePing === "boolean"
        ? options.usePing
        : String(options.usePing ?? process.env.PHILIPS_USE_PING ?? "true") ===
          "true";

    this.lastData = null;
  }

  async pingHost() {
    if (!this.host) throw new Error("PHILIPS_BRIDGE_HOST not configured");
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

  async checkHealth() {
    if (!this.host) {
      return {
        status: "offline",
        error: "PHILIPS_BRIDGE_HOST not configured",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const pingRaw = this.usePing ? await this.pingHost() : null;
      let pingResult = null;
      let pingOutput = null;

      if (this.usePing) {
        if (pingRaw && typeof pingRaw === "object") {
          pingResult = Boolean(pingRaw.success);
          pingOutput =
            pingRaw.stdout && pingRaw.stdout.trim()
              ? pingRaw.stdout.trim()
              : pingRaw.stderr && pingRaw.stderr.trim()
                ? pingRaw.stderr.trim()
                : "No ping output";
        } else {
          pingResult = false;
          pingOutput = "Ping check unavailable";
        }
      }

      const isOnline = this.usePing ? Boolean(pingResult) : false;

      const result = {
        status: isOnline ? "online" : "offline",
        timestamp: new Date().toISOString(),
        data: {
          host: this.host,
          ping: pingResult,
          pingOutput: pingOutput,
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
    const health = await this.checkHealth();
    return {
      ...health,
      lastUpdated: new Date().toISOString(),
    };
  }

  disconnect() {
    // No persistent connections
  }
}

export default PhilipsBridgeService;
