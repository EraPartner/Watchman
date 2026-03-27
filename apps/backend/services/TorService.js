import { SocksProxyAgent } from "socks-proxy-agent";
import { httpsAgent } from "../utils/httpAgentPool.js";

// Use shared HTTPS agent from pool

class TorService {
  constructor(config) {
    this.relayNickname = config.relayNickname;
    this.onionooBaseUrl =
      config.onionooBaseUrl || "https://onionoo.torproject.org";
    this.timeout = config.timeout || 10000;
    this.useProxy = config.useProxy || false;

    // Only set up proxy if enabled
    if (this.useProxy && config.torProxy) {
      this.torProxy = config.torProxy;
      this.proxyAgent = new SocksProxyAgent(
        `socks5://${this.torProxy.host}:${this.torProxy.port}`
      );
    }
  }

  async checkHealth() {
    const startTime = Date.now();

    try {
      const relayInfo = await this.searchRelayByNickname(this.relayNickname);
      const responseTime = Date.now() - startTime;

      if (!relayInfo) {
        return {
          status: "offline",
          responseTime,
          lastCheck: new Date(),
          error: `Relay with nickname "${this.relayNickname}" not found in Tor network`,
        };
      }

      // Extract version from relay info
      const currentVersion =
        relayInfo.version || relayInfo.platform || "unknown";

      if (!relayInfo.running) {
        return {
          status: "offline",
          responseTime,
          lastCheck: new Date(),
          currentVersion,
          error: `Relay "${this.relayNickname}" is not running`,
        };
      }

      if (relayInfo.hibernating) {
        return {
          status: "warning",
          responseTime,
          lastCheck: new Date(),
          currentVersion,
          error: `Relay "${this.relayNickname}" is hibernating`,
        };
      }

      return {
        status: "online",
        responseTime,
        lastCheck: new Date(),
        currentVersion,
      };
    } catch (error) {
      return {
        status: "offline",
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: error.message,
      };
    }
  }

  async getStats() {
    try {
      const relayInfo = await this.searchRelayByNickname(this.relayNickname);

      if (!relayInfo) {
        return {
          nickname: this.relayNickname,
          status: "Not Found",
          error: "Relay not found in Tor network",
        };
      }

      return {
        nickname: relayInfo.nickname,
        fingerprint: relayInfo.fingerprint.substring(0, 8) + "...",
        running: relayInfo.running,
        hibernating: relayInfo.hibernating || false,
        flags: relayInfo.flags,
        country: relayInfo.country_name || relayInfo.country || "Unknown",
        city: relayInfo.city_name || "Unknown",
        first_seen: relayInfo.first_seen,
        last_seen: relayInfo.last_seen,
        consensus_weight: relayInfo.consensus_weight || 0,
        platform: relayInfo.platform || "Unknown",
        contact: relayInfo.contact || "No contact info",
        orPort: this.extractORPort(relayInfo.or_addresses),
        relayType: this.determineRelayType(relayInfo.flags),
        version: relayInfo.version || relayInfo.platform || "Unknown",
        bandwidth: {
          current: relayInfo.observed_bandwidth || 0,
          average: relayInfo.observed_bandwidth || 0,
          burst: relayInfo.bandwidth_burst || 0,
        },
      };
    } catch (error) {
      return {
        nickname: this.relayNickname,
        status: "Error",
        error: error.message,
      };
    }
  }

  extractORPort(addresses) {
    for (const address of addresses) {
      const match = address.match(/:(\d+)$/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    return 9001;
  }

  determineRelayType(flags) {
    if (flags.includes("Exit")) return "exit";
    if (flags.includes("Guard")) return "guard";
    if (flags.includes("Bridge")) return "bridge";
    return "relay";
  }

  async searchRelayByNickname(nickname) {
    try {
      const url = `${this.onionooBaseUrl}/details?search=${encodeURIComponent(
        nickname
      )}`;

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const fetchOptions = {
        headers: {
          "User-Agent": "Watchman-Dashboard/1.0",
          Accept: "application/json",
        },
        signal: controller.signal,
      };

      // Only add proxy agent if Tor proxy is enabled
      if (this.useProxy && this.proxyAgent) {
        fetchOptions.agent = this.proxyAgent;
      }

      const response = await fetch(url, fetchOptions);

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Onionoo API request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.relays || data.relays.length === 0) {
        return null;
      }

      const exactMatch = data.relays.find(
        (relay) => relay.nickname.toLowerCase() === nickname.toLowerCase()
      );

      return exactMatch || data.relays[0];
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  async checkForUpdates() {
    try {
      // Get current relay info which includes version
      const relayInfo = await this.searchRelayByNickname(this.relayNickname);

      if (!relayInfo) {
        throw new Error(`Relay "${this.relayNickname}" not found`);
      }

      const currentVersion =
        relayInfo.version || relayInfo.platform || "Unknown";

      // Fetch latest stable version from Tor Project's GitLab API
      const response = await fetch(
        "https://gitlab.torproject.org/api/v4/projects/tpo%2Fcore%2Ftor/repository/tags?per_page=50",
        {
          headers: {
            "User-Agent": "Watchman-Dashboard",
          },
          signal: AbortSignal.timeout(10000),
          agent: httpsAgent,
        }
      );

      if (!response.ok) {
        throw new Error(`GitLab API returned ${response.status}`);
      }

      const tags = await response.json();

      // Filter out alpha and rc versions to get stable releases only
      const stableTags = tags.filter(
        (tag) =>
          !tag.name.includes("alpha") &&
          !tag.name.includes("rc") &&
          tag.name.match(/tor-\d+\.\d+\.\d+\.\d+/)
      );

      if (stableTags.length === 0) {
        throw new Error("No stable Tor versions found in GitLab");
      }

      // Extract version number from tag name (format: tor-0.4.8.19)
      const latestTag = stableTags[0].name;
      const latestVersion = latestTag.replace("tor-", "");

      // Extract version numbers for comparison
      const extractVersion = (ver) => {
        const match = String(ver).match(/(\d+)\.(\d+)\.(\d+)\.(\d+)/);
        if (!match) return null;
        return {
          major: parseInt(match[1]),
          minor: parseInt(match[2]),
          patch: parseInt(match[3]),
          build: parseInt(match[4]),
        };
      };

      const current = extractVersion(currentVersion);
      const latest = extractVersion(latestVersion);

      let updateAvailable = false;
      if (current && latest) {
        updateAvailable =
          latest.major > current.major ||
          (latest.major === current.major && latest.minor > current.minor) ||
          (latest.major === current.major &&
            latest.minor === current.minor &&
            latest.patch > current.patch) ||
          (latest.major === current.major &&
            latest.minor === current.minor &&
            latest.patch === current.patch &&
            latest.build > current.build);
      }

      return {
        currentVersion,
        updateAvailable,
        latestVersion,
        recommendedUrl: "https://www.torproject.org/download/",
      };
    } catch (error) {
      throw new Error(`Failed to check for updates: ${error.message}`);
    }
  }
}

export { TorService };
