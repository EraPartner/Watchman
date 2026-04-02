/**
 * Frontend Config Service
 *
 * Generates configuration for the frontend application.
 * Extracted from server.js to follow Single Responsibility Principle.
 *
 * This service builds the frontend configuration including:
 * - Enabled services list
 * - Service URLs and credentials
 * - Application metadata
 */

import { getConfig } from "../config.js";

let _instance = null;

export class FrontendConfigService {
  constructor() {
    this.config = getConfig();
  }

  /**
   * Build the complete frontend configuration
   * @returns {Object} Frontend configuration
   */
  build() {
    return {
      enabledServices: this.getEnabledServices(),
      services: this.buildServicesConfig(),
      app: this.getAppInfo(),
      network: this.getNetworkConfig(),
    };
  }

  /**
   * Get list of enabled services
   * @returns {Array<string>} Enabled service names
   */
  getEnabledServices() {
    return Array.from(getConfig().enabledServices);
  }

  /**
   * Get application info
   * @returns {Object} App metadata
   */
  getAppInfo() {
    return {
      name: "Watchman Dashboard",
      version: "1.0.0",
      description: "Self-hosted home lab dashboard",
    };
  }

  /**
   * Get network configuration
   * @returns {Object} Network settings
   */
  getNetworkConfig() {
    return {
      frontendUrl: process.env.FRONTEND_URL || null,
      backendUrl: process.env.BACKEND_URL || null,
    };
  }

  /**
   * Build service-specific configurations
   * @returns {Object} Service configs
   */
  buildServicesConfig() {
    return {
      adguard: this.buildAdGuardConfig(),
      bitcoin: this.buildBitcoinConfig(),
      qbittorrent: this.buildQbittorrentConfig(),
      ipfs: this.buildIpfsConfig(),
      tor: this.buildTorConfig(),
      roon: this.buildRoonConfig(),
      synology: this.buildSynologyConfig(),
      philips: this.buildPhilipsConfig(),
      homebridge: this.buildHomebridgeConfig(),
      macmini: this.buildMacMiniConfig(),
      albyhub: this.buildAlbyHubConfig(),
      beryl: this.buildBerylConfig(),
      telenet: this.buildTelenetConfig(),
      raspi: this.buildRaspiConfig(),
    };
  }

  buildAdGuardConfig() {
    return {
      webUrl:
        process.env.ADGUARD_MAIN_URL ||
        process.env.ADGUARD_URL ||
        "http://127.0.0.1:5213",
      username: process.env.ADGUARD_USERNAME || null,
      useAuth: !!(
        process.env.ADGUARD_MAIN_AUTH || process.env.ADGUARD_USERNAME
      ),
    };
  }

  buildBitcoinConfig() {
    const rpcUrl = process.env.BITCOIN_RPC_URL || "http://127.0.0.1:8332";
    const rpcUrlFromOnion =
      process.env.BITCOIN_ONION_URL && process.env.BITCOIN_RPC_PORT
        ? `http://${process.env.BITCOIN_ONION_URL}:${process.env.BITCOIN_RPC_PORT}`
        : null;

    return {
      rpcUrl: rpcUrlFromOnion || rpcUrl,
      useTor: process.env.TOR_USE_PROXY === "true",
      network: /:8332\b/.test(rpcUrlFromOnion || rpcUrl)
        ? "mainnet"
        : "testnet",
    };
  }

  buildQbittorrentConfig() {
    return {
      webUrl: process.env.QBITTORRENT_URL || "http://127.0.0.1:8069",
      username: process.env.QBITTORRENT_USERNAME || null,
    };
  }

  buildIpfsConfig() {
    const ipfsApiUrl = process.env.IPFS_API_URL;
    return {
      apiUrl: ipfsApiUrl || null,
      gatewayUrl: process.env.IPFS_GATEWAY_URL || null,
      configured: !!ipfsApiUrl,
    };
  }

  buildTorConfig() {
    return {
      controlPort: process.env.TOR_CONTROL_PORT || 9051,
      proxyPort: process.env.TOR_PROXY_PORT || 9050,
      useProxy: process.env.TOR_USE_PROXY === "true",
    };
  }

  buildRoonConfig() {
    const roonHost = process.env.ROON_HOST;
    return {
      host: roonHost || null,
      configured: !!roonHost,
    };
  }

  buildSynologyConfig() {
    return {
      // Synology uses system defaults
      configured: true,
    };
  }

  buildPhilipsConfig() {
    const philipsHost = process.env.PHILIPS_BRIDGE_HOST;
    return {
      host: philipsHost || null,
      configured: !!philipsHost,
    };
  }

  buildHomebridgeConfig() {
    const homebridgeUrl =
      process.env.HOMEBRIDGE_URL || process.env.HOMEBRIDGE_API_URL;
    return {
      baseUrl: homebridgeUrl || null,
      configured: !!homebridgeUrl,
    };
  }

  buildMacMiniConfig() {
    const macminiHost = process.env.MACMINI_HOST;
    return {
      host: macminiHost || null,
      configured: !!macminiHost,
    };
  }

  buildAlbyHubConfig() {
    const albyHubUrl = process.env.ALBYHUB_URL;
    return {
      url: albyHubUrl || null,
      configured: !!albyHubUrl,
    };
  }

  buildBerylConfig() {
    const berylHost = process.env.BERYL_HOST || process.env.ROUTER_BERYL_HOST;
    return {
      host: berylHost || null,
      configured: !!berylHost,
    };
  }

  buildTelenetConfig() {
    const telenetHost =
      process.env.TELENET_HOST || process.env.ROUTER_TELENET_HOST;
    return {
      host: telenetHost || null,
      configured: !!telenetHost,
    };
  }

  buildRaspiConfig() {
    const raspiHost = process.env.RASPI_HOST;
    return {
      host: raspiHost || null,
      configured: !!raspiHost,
    };
  }
}

/**
 * Create frontend config for a request
 * @param {Object} req - Express request (optional)
 * @param {Object} res - Express response (optional)
 * @returns {Object} Frontend configuration
 */
export function getFrontendConfig(req, res) {
  if (!_instance) _instance = new FrontendConfigService();
  return _instance.build();
}
