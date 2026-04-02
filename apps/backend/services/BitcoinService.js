/**
 * Bitcoin Service
 *
 * Provides comprehensive monitoring and interaction with Bitcoin Core node.
 * Implements secure RPC communication, health monitoring, version tracking,
 * and Tor proxy support for enhanced privacy. Features robust error handling
 * and connection management for reliable Bitcoin node integration.
 *
 * @fileoverview Bitcoin Core RPC integration and monitoring
 * @author Watchman Team
 * @version 1.0.0
 */

import { SocksProxyAgent } from "socks-proxy-agent";
import { Buffer } from "buffer";
import { logger } from "../middleware/logger.js";
import { httpAgent, httpsAgent } from "../utils/httpAgentPool.js";
import { DEFAULT_TIMEOUTS } from "../config/serviceDefaults.js";
import {
  cleanVersionString,
  isUpdateAvailable,
} from "../utils/versionComparison.js";

// Use shared HTTP agents from pool (Bitcoin uses custom timeout in requests)

/**
 * Parse numeric version format to semantic version
 *
 * Bitcoin Core uses numeric version format: Major * 10000 + Minor * 100 + Revision
 * Example: 270000 represents version 27.0.0
 *
 * @param {number} version - Numeric version from Bitcoin Core
 * @returns {string|null} Semantic version string or null if invalid
 */
function parseNumericVersion(version) {
  if (typeof version !== "number" || version < 0) {
    return null;
  }

  // Bitcoin Core version number format calculation
  const major = Math.floor(version / 10000);
  const minor = Math.floor((version % 10000) / 100);
  const patch = version % 100;

  return `${major}.${minor}.${patch}`;
}

/**
 * Extract Bitcoin version from network info
 *
 * @param {Object} networkInfo - Network info from Bitcoin RPC
 * @returns {string} Version string
 * @private
 */
function getBitcoinVersion(networkInfo) {
  if (!networkInfo) return "unknown";

  // Try subversion first (string format like "/Satoshi:27.0.0/")
  if (networkInfo.subversion) {
    const cleaned = cleanVersionString(networkInfo.subversion);
    if (cleaned && cleaned !== "" && cleaned !== "unknown") return cleaned;
  }

  // Try numeric version (number format like 270000)
  if (typeof networkInfo.version === "number") {
    const parsed = parseNumericVersion(networkInfo.version);
    if (parsed) return parsed;
  }

  // Try version as string (in case it's already formatted)
  if (typeof networkInfo.version === "string") {
    const cleaned = cleanVersionString(networkInfo.version);
    if (cleaned && cleaned !== "" && cleaned !== "unknown") return cleaned;
  }

  return "unknown";
}

function getVersionFromGitHubTag(tag) {
  if (typeof tag !== "string") return "";
  // Extract version number from GitHub tag, e.g., "v27.0" -> "27.0"
  const match = tag.match(/v?(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : "";
}

export class BitcoinService {
  constructor(config = {}) {
    // Determine timeout values (ms) and corresponding curl timeouts (s)
    const timeoutMs = config.timeout || 120000; // default to 120 seconds
    const connectTimeoutSec =
      config.connectTimeout || Math.max(15, Math.ceil(timeoutMs / 1000));
    const maxTimeSec =
      config.maxTime ||
      Math.max(connectTimeoutSec, Math.ceil(timeoutMs / 1000));

    this.config = {
      rpcUrl: config.rpcUrl || "http://127.0.0.1:8332",
      rpcUser: config.rpcUser || process.env.BITCOIN_RPC_USER,
      rpcPassword: config.rpcPassword || process.env.BITCOIN_RPC_PASSWORD,
      timeout: timeoutMs, // total timeout in ms
      connectTimeout: connectTimeoutSec,
      maxTime: maxTimeSec,
      ...config,
    };

    // Proxy availability cache
    this._proxyAvailable = null;
    this._proxyCheckTime = 0;
    this._proxyCheckTTL = 30000;

    // If configured to use a SOCKS proxy, create and cache the agent here
    if (this.config.useProxy && this.config.torProxy) {
      const { host, port } = this.config.torProxy;
      // Use socks5h to ensure remote DNS resolution of .onion hosts
      const proxyUrl = `socks5h://${host}:${port}`;
      try {
        this.proxyAgent = new SocksProxyAgent(proxyUrl);
      } catch (err) {
        // Fail gracefully; proxyAgent will be undefined and code will handle it later
        this.proxyAgent = undefined;
        logger.warning("Failed to create SocksProxyAgent", {
          error: err.message,
        });
      }
    }
  }

  async checkHealth() {
    try {
      // Get both blockchain info and network info to include version
      const [blockchainInfo, networkInfo] = await Promise.all([
        this.executeRpcCommand("getblockchaininfo"),
        this.executeRpcCommand("getnetworkinfo").catch(() => null),
      ]);

      if (blockchainInfo && blockchainInfo.chain) {
        // Extract version from network info
        const currentVersion = networkInfo?.subversion
          ? cleanVersionString(networkInfo.subversion)
          : networkInfo?.version
            ? String(networkInfo.version)
            : "unknown";

        return {
          status: "online",
          timestamp: new Date().toISOString(),
          currentVersion,
        };
      } else {
        return {
          status: "warning",
          error: "Bitcoin node responding but data incomplete",
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      return {
        status: "offline",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getStats() {
    try {
      // Get blockchain info
      const blockchainInfo = await this.executeRpcCommand("getblockchaininfo");

      // Get network info for connections and version
      const networkInfo = await this.executeRpcCommand("getnetworkinfo");

      // Get mempool info
      const mempoolInfo = await this.executeRpcCommand("getmempoolinfo");

      // Get uptime
      const uptime = await this.executeRpcCommand("uptime");

      return {
        version: networkInfo.subversion || networkInfo.version || "Unknown",
        protocolVersion: networkInfo.protocolversion || 0,
        blocks: blockchainInfo.blocks || 0,
        headers: blockchainInfo.headers || 0,
        connections: networkInfo.connections || 0,
        inbound: networkInfo.connections_in || 0,
        outbound: networkInfo.connections_out || 0,
        difficulty: blockchainInfo.difficulty || 0,
        verificationProgress: blockchainInfo.verificationprogress || 0,
        initialBlockDownload: blockchainInfo.initialblockdownload || false,
        chain: blockchainInfo.chain || "unknown",
        // size_on_disk is provided by Bitcoin Core and represents the on-disk chain size in bytes
        blockchainSize: blockchainInfo.size_on_disk || 0,
        networkHashPs: blockchainInfo.networkhashps || 0,
        mempool: {
          size: mempoolInfo.size || 0,
          bytes: mempoolInfo.bytes || 0,
          usage: mempoolInfo.usage || 0,
          maxmempool: mempoolInfo.maxmempool || 0,
          mempoolminfee: mempoolInfo.mempoolminfee || 0,
        },
        uptime: uptime || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get Bitcoin stats: ${error.message}`);
    }
  }

  async executeRpcCommand(method, params = []) {
    if (!this.config.rpcUser || !this.config.rpcPassword) {
      throw new Error("Bitcoin RPC credentials not configured");
    }

    // If using proxy, first check if it's available (cached)
    if (this.config.useProxy) {
      const now = Date.now();
      if (
        this._proxyAvailable === null ||
        now - this._proxyCheckTime > this._proxyCheckTTL
      ) {
        this._proxyAvailable = await this.checkProxyConnection();
        this._proxyCheckTime = now;
      }
      if (!this._proxyAvailable) {
        throw new Error(
          `Tor proxy not available at ${this.config.torProxy.host}:${this.config.torProxy.port} - check if Tor is running with SOCKS proxy enabled`
        );
      }
    }

    const body = JSON.stringify({
      jsonrpc: "1.0",
      id: "watchman",
      method,
      params,
    });
    // Use proper JSON content type
    const headers = { "content-type": "application/json" };

    // Add basic auth header if credentials are provided
    if (this.config.rpcUser && this.config.rpcPassword) {
      const token = Buffer.from(
        `${this.config.rpcUser}:${this.config.rpcPassword}`
      ).toString("base64");
      headers["authorization"] = `Basic ${token}`;
    }

    // Prepare fetch options
    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    const fetchOptions = {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      // keep other options extensible
    };

    // If using SOCKS proxy (Tor), attach the agent in a shape node-fetch expects
    if (this.config.useProxy && this.config.torProxy && this.proxyAgent) {
      // node-fetch expects an Agent-like object or a function that returns one.
      // Passing a protocol mapping caused: "options.agent must be one of Agent-like Object... Received an instance of Object".
      // Provide the agent instance directly to avoid that error.
      fetchOptions.agent = this.proxyAgent;
    } else {
      // For non-proxy requests, use the standard HTTP/HTTPS agent to fix connection issues
      fetchOptions.agent = this.config.rpcUrl.startsWith("https:")
        ? httpsAgent
        : httpAgent;
    }

    try {
      const response = await fetch(this.config.rpcUrl, fetchOptions);
      clearTimeout(timeoutHandle);

      if (!response.ok) {
        const status = response.status;
        const text = await response.text().catch(() => "");
        if (status === 401 || text.includes("Unauthorized")) {
          throw new Error(
            "Bitcoin RPC authentication failed - check credentials"
          );
        }
        throw new Error(`Bitcoin RPC returned HTTP ${status} ${text}`);
      }

      const parsed = await response.json();

      if (parsed.error) {
        throw new Error(`Bitcoin RPC error: ${parsed.error.message}`);
      }

      return parsed.result;
    } catch (error) {
      // Normalize common network errors
      const msg = (error && error.message) || String(error);
      if (
        msg.includes("The user aborted a request") ||
        msg === "The operation was aborted." ||
        msg.includes("aborted")
      ) {
        throw new Error(
          "Bitcoin RPC request timed out - node may be slow or unreachable"
        );
      } else if (msg.includes("ECONNREFUSED")) {
        throw new Error(
          "Bitcoin node not reachable - check if Bitcoin Core is running"
        );
      } else if (msg.includes("401") || msg.includes("Unauthorized")) {
        throw new Error(
          "Bitcoin RPC authentication failed - check credentials"
        );
      } else if (
        msg.includes("ENOTFOUND") ||
        msg.includes("Could not resolve host")
      ) {
        throw new Error(
          "Cannot resolve Bitcoin node hostname - check network or Tor proxy"
        );
      } else if (
        msg.includes("SOCKS") ||
        msg.includes("proxy") ||
        msg.includes("Proxy")
      ) {
        throw new Error(
          "SOCKS proxy connection failed - check if Tor is running with SOCKS proxy on the configured port"
        );
      } else {
        throw new Error(`Bitcoin RPC call failed: ${msg}`);
      }
    }
  }

  async checkProxyConnection() {
    try {
      // Use spawn instead of execSync to prevent command injection
      const { spawn } = await import("child_process");

      // Validate inputs to prevent injection
      if (!this.config.torProxy.host || !this.config.torProxy.port) {
        throw new Error("Invalid proxy configuration");
      }

      const host = String(this.config.torProxy.host).trim();
      const port = String(this.config.torProxy.port).trim();

      // Validate host format (basic validation)
      if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
        throw new Error("Invalid host format");
      }

      // Validate port range
      const portNum = parseInt(port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error("Invalid port number");
      }

      return new Promise((resolve) => {
        const child = spawn("nc", ["-z", host, port], {
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });

        child.on("close", (code) => {
          resolve(code === 0);
        });

        child.on("error", () => {
          resolve(false);
        });

        // Timeout fallback
        setTimeout(() => {
          child.kill();
          resolve(false);
        }, 5000);
      });
    } catch {
      return false;
    }
  }

  async checkForUpdates() {
    try {
      // Get network info which contains the version
      const networkInfo = await this.executeRpcCommand("getnetworkinfo");

      // Use getBitcoinVersion to handle both numeric and string formats
      const currentVersion = getBitcoinVersion(networkInfo);

      // Fetch latest Bitcoin Core release from GitHub API
      const response = await fetch(
        "https://api.github.com/repos/bitcoin/bitcoin/releases/latest",
        {
          headers: {
            "User-Agent": "Watchman-Dashboard",
            Accept: "application/vnd.github.v3+json",
          },
          signal: AbortSignal.timeout(10000),
          agent: httpsAgent, // Use HTTPS agent for GitHub API
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const releaseData = await response.json();
      const latestVersion = getVersionFromGitHubTag(
        releaseData.tag_name || releaseData.name || ""
      );

      return {
        currentVersion: currentVersion || "unknown",
        updateAvailable: isUpdateAvailable(currentVersion, latestVersion),
        latestVersion: latestVersion || "unknown",
        releaseUrl: releaseData.html_url,
      };
    } catch (error) {
      throw new Error(`Failed to check for updates: ${error.message}`);
    }
  }
}
