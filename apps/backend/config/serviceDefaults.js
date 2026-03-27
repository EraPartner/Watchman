/**
 * Service Default Constants
 *
 * Centralized default values for services.
 * Extracts magic numbers from throughout the codebase.
 */

export const DEFAULT_TIMEOUTS = {
  bitcoin: 120000, // 120 seconds for Bitcoin RPC
  adguard: 5000, // 5 seconds
  qbittorrent: 10000, // 10 seconds
  synology: 5000, // 5 seconds
  roon: 3000, // 3 seconds
  philips: 3000, // 3 seconds
  homebridge: 10000, // 10 seconds
  macmini: 10000, // 10 seconds
  albyhub: 5000, // 5 seconds
  ipfs: 5000, // 5 seconds
  tor: 10000, // 10 seconds
  raspi: 10000, // 10 seconds
  default: 5000, // 5 seconds fallback
};

export const DEFAULT_PING_INTERVALS = {
  health: 30000, // 30 seconds for health checks
  stats: 60000, // 60 seconds for stats
  updates: 3600000, // 1 hour for update checks
};

export const DEFAULT_PING_COUNT = {
  default: 2,
  quick: 1,
};

export const DEFAULT_PORTS = {
  http: 80,
  https: 443,
  bitcoin: 8332,
  bitcoinTestnet: 18332,
  qbittorrent: 8069,
  adguard: 3000,
  homebridge: 8581,
  albyhub: 3000,
  ipfs: 5001,
  torProxy: 9050,
  torControl: 9051,
};

export const DEFAULT_KEEPALIVE = {
  msecs: 30000, // 30 seconds
  maxSockets: 25,
};

export const SERVICE_NAMES = {
  adguard: "AdGuard Home",
  bitcoin: "Bitcoin Core",
  bitcoinTestnet: "Bitcoin (Testnet)",
  qbittorrent: "qBittorrent",
  synology: "Synology NAS",
  ipfs: "IPFS",
  roon: "Roon Server",
  tor: "Tor Relay",
  philips: "Philips Hue",
  homebridge: "Homebridge",
  macmini: "Mac Mini",
  albyhub: "Alby Hub",
  beryl: "Beryl Router",
  telenet: "Telenet Router",
  raspi: "Raspberry Pi",
};
