/**
 * Service Factory Configuration
 *
 * Defines the configuration for each service type.
 * This enables a declarative, DRY approach to service initialization.
 *
 * Each entry defines:
 * - Service class to instantiate
 * - Required environment variables
 * - Default values
 * - Optional flag (whether service requires specific env vars)
 */

import { BitcoinService } from "./BitcoinService.js";
import { AdGuardService } from "./AdGuardService.js";
import { TorService } from "./TorService.js";
import { TorManager } from "./TorManager.js";
import { QBittorrentService } from "./QBittorrentService.js";
import SynologyService from "./SynologyService.js";
import RoonService from "./RoonService.js";
import PhilipsBridgeService from "./PhilipsBridgeService.js";
import { AlbyHubService } from "./AlbyHubService.js";
import MacMiniService from "./MacMiniService.js";
import RouterService from "./RouterService.js";
import IpfsService from "./IpfsService.js";
import HomebridgeService from "./HomebridgeService.js";
import RaspberryPiService from "./RaspberryPiService.js";

/**
 * Service factory configurations
 * Maps service names to their initialization configs
 */
export const serviceFactoryConfigs = {
  bitcoin: {
    ServiceClass: BitcoinService,
    required: false, // Has its own fallback in config
    getConfig: () => {
      const rpcUrlFromOnion =
        process.env.BITCOIN_ONION_URL && process.env.BITCOIN_RPC_PORT
          ? `http://${process.env.BITCOIN_ONION_URL}:${process.env.BITCOIN_RPC_PORT}`
          : null;
      const rpcUrl =
        rpcUrlFromOnion ||
        process.env.BITCOIN_RPC_URL ||
        "http://127.0.0.1:8332";

      return {
        rpcUrl,
        rpcUser: process.env.BITCOIN_RPC_USER,
        rpcPassword: process.env.BITCOIN_RPC_PASSWORD,
        timeout: parseInt(process.env.BITCOIN_TIMEOUT) || 120000,
        connectTimeout: process.env.BITCOIN_CONNECT_TIMEOUT
          ? parseInt(process.env.BITCOIN_CONNECT_TIMEOUT)
          : undefined,
        maxTime: process.env.BITCOIN_MAX_TIME
          ? parseInt(process.env.BITCOIN_MAX_TIME)
          : undefined,
        useProxy: process.env.TOR_USE_PROXY === "true",
        torProxy: {
          host: process.env.TOR_PROXY_HOST || "127.0.0.1",
          port: parseInt(process.env.TOR_PROXY_PORT) || 9050,
        },
      };
    },
  },

  adguard: {
    ServiceClass: AdGuardService,
    required: false,
    getConfig: () => ({
      baseUrl:
        process.env.ADGUARD_MAIN_URL ||
        process.env.ADGUARD_URL ||
        "http://localhost:3000",
      authToken: process.env.ADGUARD_MAIN_AUTH,
      username: process.env.ADGUARD_USERNAME,
      password: process.env.ADGUARD_PASSWORD,
      timeout: parseInt(process.env.ADGUARD_TIMEOUT) || 5000,
    }),
  },

  tor: {
    ServiceClass: TorService,
    required: false,
    getConfig: () => ({
      relayNickname: process.env.TOR_RELAY_NICKNAME || "default-relay",
      onionooBaseUrl:
        process.env.TOR_ONIONOO_URL || "https://onionoo.torproject.org",
      timeout: parseInt(process.env.TOR_TIMEOUT) || 10000,
      useProxy: process.env.TOR_USE_PROXY === "true" || false,
      torProxy: {
        host: process.env.TOR_PROXY_HOST || "127.0.0.1",
        port: parseInt(process.env.TOR_PROXY_PORT) || 9050,
      },
    }),
  },

  qbittorrent: {
    ServiceClass: QBittorrentService,
    required: false,
    getConfig: () => ({
      baseUrl: process.env.QBITTORRENT_URL || "http://127.0.0.1:8069",
      timeout: parseInt(process.env.QBITTORRENT_TIMEOUT) || 10000,
    }),
  },

  synology: {
    ServiceClass: SynologyService,
    required: false,
    getConfig: () => ({}),
  },

  ipfs: {
    ServiceClass: IpfsService,
    required: false, // Optional - requires IPFS_API_URL
    getConfig: () => {
      const ipfsApiUrl = process.env.IPFS_API_URL || null;
      if (!ipfsApiUrl) return null;
      return {
        apiUrl: ipfsApiUrl,
        timeout: process.env.IPFS_TIMEOUT
          ? parseInt(process.env.IPFS_TIMEOUT)
          : 5000,
      };
    },
  },

  roon: {
    ServiceClass: RoonService,
    required: false, // Optional - requires ROON_HOST
    getConfig: () => {
      if (!process.env.ROON_HOST) return null;
      return {
        host: process.env.ROON_HOST,
        ports: process.env.ROON_PORTS || process.env.ROON_DEFAULT_PORT,
        timeout: parseInt(process.env.ROON_TIMEOUT) || 3000,
        pingCount: parseInt(process.env.ROON_PING_COUNT) || 2,
        usePing: process.env.ROON_USE_PING === "false" ? false : true,
      };
    },
  },

  philips: {
    ServiceClass: PhilipsBridgeService,
    required: false,
    getConfig: () => {
      if (!process.env.PHILIPS_BRIDGE_HOST) return null;
      return {
        host: process.env.PHILIPS_BRIDGE_HOST,
        pingCount: process.env.PHILIPS_PING_COUNT
          ? parseInt(process.env.PHILIPS_PING_COUNT)
          : undefined,
        timeout: process.env.PHILIPS_TIMEOUT
          ? parseInt(process.env.PHILIPS_TIMEOUT)
          : undefined,
        usePing: process.env.PHILIPS_USE_PING === "false" ? false : true,
      };
    },
  },

  homebridge: {
    ServiceClass: HomebridgeService,
    required: false, // Optional - requires HOMEBRIDGE_URL
    getConfig: () => {
      const homebridgeUrl =
        process.env.HOMEBRIDGE_URL || process.env.HOMEBRIDGE_API_URL || null;
      if (!homebridgeUrl) return null;
      return {
        baseUrl: homebridgeUrl,
        statusPath:
          process.env.HOMEBRIDGE_STATUS_PATH ||
          "/api/status/server-information",
        versionPath:
          process.env.HOMEBRIDGE_VERSION_PATH ||
          "/api/status/homebridge-version",
        timeout: process.env.HOMEBRIDGE_TIMEOUT
          ? parseInt(process.env.HOMEBRIDGE_TIMEOUT)
          : undefined,
        authToken:
          process.env.HOMEBRIDGE_AUTH_TOKEN ||
          process.env.HOMEBRIDGE_TOKEN ||
          null,
        username:
          process.env.HOMEBRIDGE_USERNAME ||
          process.env.HOMEBRIDGE_USER ||
          null,
        password: process.env.HOMEBRIDGE_PASSWORD || null,
      };
    },
    postInit: "homebridgeLogin",
  },

  macmini: {
    ServiceClass: MacMiniService,
    required: false,
    getConfig: () => {
      if (!process.env.MACMINI_HOST) return null;
      return {
        host: process.env.MACMINI_HOST,
        sshUser: process.env.MACMINI_SSH_USER,
        sshPort: process.env.MACMINI_SSH_PORT
          ? parseInt(process.env.MACMINI_SSH_PORT)
          : undefined,
        sshKey: process.env.MACMINI_SSH_KEY_PATH || process.env.MACMINI_SSH_KEY,
        timeout: process.env.MACMINI_TIMEOUT
          ? parseInt(process.env.MACMINI_TIMEOUT)
          : undefined,
      };
    },
  },

  albyhub: {
    ServiceClass: AlbyHubService,
    required: false,
    getConfig: () => {
      if (!process.env.ALBYHUB_URL) return null;
      return {
        baseUrl: process.env.ALBYHUB_URL,
        timeout: process.env.ALBYHUB_TIMEOUT
          ? parseInt(process.env.ALBYHUB_TIMEOUT)
          : undefined,
        authToken: process.env.ALBYHUB_TOKEN || null,
      };
    },
  },

  beryl: {
    ServiceClass: RouterService,
    required: false,
    getConfig: () => {
      const berylHost =
        process.env.BERYL_HOST || process.env.ROUTER_BERYL_HOST || null;
      if (!berylHost) return null;
      const berylPorts =
        process.env.BERYL_PORTS || process.env.ROUTER_BERYL_PORTS || null;
      return {
        name: "beryl",
        host: berylHost,
        ports: berylPorts
          ? String(berylPorts)
              .split(/[ ,]+/)
              .map((p) => Number(p))
              .filter(Boolean)
          : [],
        timeout: process.env.BERYL_TIMEOUT_MS
          ? parseInt(process.env.BERYL_TIMEOUT_MS)
          : 3000,
        pingCount: process.env.BERYL_PING_COUNT
          ? parseInt(process.env.BERYL_PING_COUNT)
          : 1,
      };
    },
  },

  telenet: {
    ServiceClass: RouterService,
    required: false,
    getConfig: () => {
      const telenetHost =
        process.env.TELENET_HOST || process.env.ROUTER_TELENET_HOST || null;
      if (!telenetHost) return null;
      const telenetPorts =
        process.env.TELENET_PORTS || process.env.ROUTER_TELENET_PORTS || null;
      return {
        name: "telenet",
        host: telenetHost,
        ports: telenetPorts
          ? String(telenetPorts)
              .split(/[ ,]+/)
              .map((p) => Number(p))
              .filter(Boolean)
          : [],
        timeout: process.env.TELENET_TIMEOUT_MS
          ? parseInt(process.env.TELENET_TIMEOUT_MS)
          : 3000,
        pingCount: process.env.TELENET_PING_COUNT
          ? parseInt(process.env.TELENET_PING_COUNT)
          : 1,
      };
    },
  },

  raspi: {
    ServiceClass: RaspberryPiService,
    required: false,
    getConfig: () => {
      if (!process.env.RASPI_HOST) return null;
      return {
        host: process.env.RASPI_HOST,
        port: process.env.RASPI_PORT
          ? parseInt(process.env.RASPI_PORT)
          : undefined,
        timeout: process.env.RASPI_TIMEOUT
          ? parseInt(process.env.RASPI_TIMEOUT)
          : undefined,
      };
    },
  },
};

/**
 * Get all service names that support multi-instance
 */
export const multiInstanceServices = new Set([
  "adguard",
  "bitcoin",
  "qbittorrent",
  "tor",
  "albyhub",
  "beryl",
  "telenet",
]);

/**
 * Get default instance ID for a service type
 */
export function getDefaultInstanceId(serviceType) {
  return multiInstanceServices.has(serviceType)
    ? `${serviceType}`
    : serviceType;
}
