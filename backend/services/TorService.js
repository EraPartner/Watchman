import { SocksProxyAgent } from "socks-proxy-agent";

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

      if (!relayInfo.running) {
        return {
          status: "offline",
          responseTime,
          lastCheck: new Date(),
          error: `Relay "${this.relayNickname}" is not running`,
        };
      }

      if (relayInfo.hibernating) {
        return {
          status: "warning",
          responseTime,
          lastCheck: new Date(),
          error: `Relay "${this.relayNickname}" is hibernating`,
        };
      }

      return {
        status: "online",
        responseTime,
        lastCheck: new Date(),
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
}

export { TorService };
