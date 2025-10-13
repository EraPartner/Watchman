import { execSync } from "child_process";
import fetch from "node-fetch";
import http from "http";
import https from "https";
import { SocksProxyAgent } from "socks-proxy-agent";
import { Buffer } from "buffer";

// Create agents with keepAlive to fix connection issues
const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 });

function cleanVersionString(version) {
  if (typeof version !== "string") return "";

  // Handle /Satoshi:X.Y.Z/ format
  const satoshiMatch = version.match(/\/Satoshi:(\d+\.\d+\.\d+)/);
  if (satoshiMatch) {
    return satoshiMatch[1];
  }

  // Handle other formats - remove slashes and extra text
  let cleaned = version
    .trim()
    .replace(/^\//, "") // Remove leading slash
    .replace(/\/$/, "") // Remove trailing slash
    .replace(/^[vV]ersion:\s*/, ""); // Remove "version:" prefix

  // Extract version number if present
  const versionMatch = cleaned.match(/(\d+\.\d+\.\d+)/);
  if (versionMatch) {
    return versionMatch[1];
  }

  return cleaned.substring(0, 32);
}

function parseNumericVersion(version) {
  if (typeof version !== "number") {
    return null;
  }

  // Bitcoin Core version number format:
  // Major version * 10000 + Minor version * 100 + Revision
  // Example: 270000 = 27 * 10000 + 0 * 100 + 0 = v27.0.0
  const major = Math.floor(version / 10000);
  const minor = Math.floor((version % 10000) / 100);
  const patch = version % 100;

  return `${major}.${minor}.${patch}`;
}

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

function isUpdateAvailable(current, latest) {
  if (!current || !latest || current === "unknown" || latest === "unknown") {
    return false;
  }

  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentVer = currentParts[i] || 0;
    const latestVer = latestParts[i] || 0;
    if (latestVer > currentVer) return true;
    if (latestVer < currentVer) return false;
  }
  return false;
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
        console.warn("⚠️  Failed to create SocksProxyAgent:", err.message);
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

    // If using proxy, first check if it's available
    if (this.config.useProxy) {
      const proxyAvailable = await this.checkProxyConnection();
      if (!proxyAvailable) {
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
      const result = execSync(
        `nc -z ${this.config.torProxy.host} ${this.config.torProxy.port}`,
        {
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      return true;
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