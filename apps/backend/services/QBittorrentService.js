import fetch from "node-fetch";
import http from "http";
import https from "https";
import logger from "../middleware/logger.js";

// Create agents with keepAlive to fix connection issues
const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 });

export class QBittorrentService {
  constructor(config = {}) {
    this.baseUrl =
      config.baseUrl ||
      process.env.QBITTORRENT_URL ||
      "http://192.168.0.143:8069";
    this.username =
      config.username || process.env.QBITTORRENT_USERNAME || "admin";
    this.password = config.password || process.env.QBITTORRENT_PASSWORD || "";
    this.timeout =
      config.timeout || parseInt(process.env.QBITTORRENT_TIMEOUT) || 3000; // Reduced default timeout for LAN
    this.cookie = null;
    this.lastCheck = null;
    this.checkInterval = 30000; // 30 seconds
    this.cookieExpiry = null; // Track cookie expiration
  }

  // Helper method to format bytes
  static formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Helper method to format speed
  static formatSpeed(bytesPerSecond) {
    return QBittorrentService.formatBytes(bytesPerSecond) + "/s";
  }

  async authenticate() {
    try {
      const loginUrl = `${this.baseUrl}/api/v2/auth/login`;
      const formData = new URLSearchParams();
      formData.append("username", this.username);
      formData.append("password", this.password);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(loginUrl, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        signal: controller.signal,
        agent: loginUrl.startsWith("https:") ? httpsAgent : httpAgent,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const responseText = await response.text();

        const setCookieHeader = response.headers.get("set-cookie");
        if (setCookieHeader) {
          this.cookie = setCookieHeader.split(";")[0];
          this.cookieExpiry = Date.now() + 3600 * 1000; // Set cookie expiry to 1 hour from now
          return true;
        }
      }
      return false;
    } catch (error) {
      if (error.name === "AbortError") {
        logger.debug("qBittorrent authentication timed out", {
          service: "qbittorrent",
        });
      } else {
        logger.debug("qBittorrent authentication failed", {
          service: "qbittorrent",
          error: error.message,
        });
      }
      return false;
    }
  }

  async makeRequest(endpoint) {
    if (!this.cookie || Date.now() > this.cookieExpiry) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        throw new Error("Authentication failed");
      }
    }

    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          Cookie: this.cookie,
        },
        signal: controller.signal,
        agent: url.startsWith("https:") ? httpsAgent : httpAgent,
      });

      clearTimeout(timeoutId);

      if (response.status === 403) {
        // Re-authenticate and retry
        logger.debug("qBittorrent session expired, re-authenticating", {
          service: "qbittorrent",
        });
        this.cookie = null;
        const authenticated = await this.authenticate();
        if (!authenticated) {
          throw new Error("Re-authentication failed");
        }

        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(
          () => retryController.abort(),
          this.timeout,
        );

        const retryResponse = await fetch(url, {
          headers: {
            Cookie: this.cookie,
          },
          signal: retryController.signal,
          agent: url.startsWith("https:") ? httpsAgent : httpAgent,
        });

        clearTimeout(retryTimeoutId);

        if (!retryResponse.ok) {
          throw new Error(
            `Request failed after retry: ${retryResponse.status}`,
          );
        }

        return this.parseResponse(retryResponse);
      }

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      return this.parseResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error("Request timed out");
      }
      throw error;
    }
  }

  async parseResponse(response) {
    const contentType = response.headers.get("content-type");
    const text = await response.text();

    // Handle empty responses
    if (!text || text.trim() === "") {
      return null;
    }

    // Try to parse as JSON first
    if (contentType && contentType.includes("application/json")) {
      try {
        return JSON.parse(text);
      } catch (error) {
        return text;
      }
    }

    // For non-JSON responses, try to parse anyway (qBittorrent sometimes returns JSON without proper content-type)
    try {
      return JSON.parse(text);
    } catch (error) {
      // If it's not JSON, return the raw text (like version strings)
      return text.replace(/^"|"$/g, ""); // Remove surrounding quotes from plain text responses
    }
  }

  async checkHealth() {
    const startTime = Date.now();

    try {
      // Try to get version info as a health check
      await this.makeRequest("/api/v2/app/version");

      const responseTime = Date.now() - startTime;

      return {
        status: "online",
        responseTime,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      logger.debug("qBittorrent health check failed", {
        service: "qbittorrent",
        error: error.message,
      });

      const responseTime = Date.now() - startTime;

      return {
        status: "offline",
        responseTime,
        error: error.message,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  async getStatus() {
    // Delegate to checkHealth for consistency with other services
    return this.checkHealth();
  }

  async getStats() {
    try {
      const [version, preferences, mainData, transferInfo] = await Promise.all([
        this.makeRequest("/api/v2/app/version"),
        this.makeRequest("/api/v2/app/preferences"),
        this.makeRequest("/api/v2/sync/maindata"),
        this.makeRequest("/api/v2/transfer/info"),
      ]);

      const serverState = mainData.server_state || {};

      return {
        version: version,
        uptime: serverState.uptime || 0,
        torrents: {
          total: Object.keys(mainData.torrents || {}).length,
          downloading: Object.values(mainData.torrents || {}).filter(
            (t) => t.state === "downloading",
          ).length,
          seeding: Object.values(mainData.torrents || {}).filter(
            (t) => t.state === "uploading",
          ).length,
          paused: Object.values(mainData.torrents || {}).filter(
            (t) => t.state === "pausedDL" || t.state === "pausedUP",
          ).length,
          completed: Object.values(mainData.torrents || {}).filter(
            (t) => t.state === "uploading" || t.state === "stalledUP",
          ).length,
        },
        transfer: {
          dlSpeed: transferInfo.dl_info_speed || 0,
          upSpeed: transferInfo.up_info_speed || 0,
          dlData: transferInfo.dl_info_data || 0,
          upData: transferInfo.up_info_data || 0,
          dlSession: transferInfo.dl_info_data || 0,
          upSession: transferInfo.up_info_data || 0,
        },
        connection: {
          status: serverState.connection_status || "disconnected",
          port: preferences.listen_port || 0,
          dhtNodes: serverState.dht_nodes || 0,
        },
        freeSpaceOnDisk: serverState.free_space_on_disk || 0,
      };
    } catch (error) {
      logger.debug("Failed to fetch qBittorrent stats", {
        service: "qbittorrent",
        error: error.message,
      });
      throw error;
    }
  }
}
