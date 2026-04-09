import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { validateSecurityConfig } from "./config/security.js";
import { envBool, envInt, envList } from "./utils/env.js";

// Get current directory for proper path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// NOTE: dotenv is loaded by server.js before this module is imported.
// This file only reads from process.env.

// Simple logger for config validation (before full logger is available)
const configLogger = {
  info: (msg) =>
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: `[CONFIG] ${msg}`,
      })
    ),
  warn: (msg) =>
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "WARN",
        message: `[CONFIG] WARNING: ${msg}`,
      })
    ),
  error: (msg) =>
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: `[CONFIG] ERROR: ${msg}`,
      })
    ),
};

// URL validation helper
const isValidUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// Environment variable validation
const requiredEnvVars = [
  "AUTH_USERNAME",
  "AUTH_PASSWORD_HASH",
  "JWT_SECRET",
  "FRONTEND_URL",
];

// Optional but recommended for production (align names to .env.local)
const recommendedEnvVars = ["ADGUARD_MAIN_URL", "ADGUARD_MAIN_AUTH"];

/**
 * Validate environment variables and security configuration
 *
 * Performs comprehensive validation of required environment variables,
 * security settings, and configuration consistency. Exits process
 * with detailed error messages if validation fails.
 *
 * @throws {SystemExit} Exits process with code 1 if validation fails
 */
const validateEnvironment = () => {
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  const missingRecommended = recommendedEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  // Validate security configuration
  const securityErrors = validateSecurityConfig();
  if (securityErrors.length > 0) {
    configLogger.error("Security configuration validation failed:");
    securityErrors.forEach((error) => configLogger.error(`  - ${error}`));
    process.exit(1);
  }

  if (missing.length > 0) {
    configLogger.error("Missing required environment variables:");
    missing.forEach((envVar) => configLogger.error(`  - ${envVar}`));
    configLogger.error(
      "\n📝 Please check your .env.local file and ensure all required variables are set."
    );
    configLogger.error("💡 Use backend/.env.example as a template.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && missingRecommended.length > 0) {
    configLogger.warn(
      "Missing recommended environment variables for production:"
    );
    missingRecommended.forEach((envVar) => configLogger.warn(`  - ${envVar}`));
  }

  // Validate JWT_SECRET strength in all environments to avoid weak local setups
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    configLogger.error("JWT_SECRET must be at least 32 characters long");
    process.exit(1);
  }

  // Enhanced FRONTEND_URL validation
  if (process.env.FRONTEND_URL && !isValidUrl(process.env.FRONTEND_URL)) {
    configLogger.error(
      "FRONTEND_URL must be a valid URL (http:// or https://)"
    );
    process.exit(1);
  }

  // Warn if production without HTTPS (except for localhost/local networks)
  if (
    process.env.NODE_ENV === "production" &&
    process.env.FRONTEND_URL &&
    !process.env.FRONTEND_URL.startsWith("https://")
  ) {
    const url = process.env.FRONTEND_URL;
    const isLocalhost =
      url.includes("localhost") ||
      url.includes("127.0.0.1") ||
      url.includes("0.0.0.0");
    const isLocalNetwork = url.match(/https?:\/\/(192\.168\.|10\.|172\.)/);

    if (!isLocalhost && !isLocalNetwork) {
      configLogger.warn(
        "FRONTEND_URL should use HTTPS in production for security (cookies, HSTS)"
      );
    }
  }

  // Validate critical service configurations if present
  if (
    process.env.ADGUARD_MAIN_URL &&
    !isValidUrl(process.env.ADGUARD_MAIN_URL)
  ) {
    configLogger.error("ADGUARD_MAIN_URL must be a valid URL");
    process.exit(1);
  }

  configLogger.info("Environment validation passed");
};

// Parse enabled services from environment variable
const parseEnabledServices = () => {
  const enabledServices = envList("ENABLED_SERVICES").map((service) =>
    service.toLowerCase()
  );

  if (enabledServices.length === 0) {
    // If not specified, enable all services by default
    return new Set([
      "bitcoin",
      "adguard",
      "tor",
      "qbittorrent",
      "synology",
      "ipfs",
      "roon",
      "philips",
      "homebridge",
      "macmini",
      "albyhub",
      "beryl",
      "telenet",
      "raspi",
    ]);
  }

  return new Set(enabledServices);
};

// Parse multi-instance service configurations
// Looks for patterns like SERVICE_1_*, SERVICE_2_*, etc.
const parseServiceInstances = (serviceType) => {
  const instances = [];
  const envVars = Object.keys(process.env);
  const upperServiceType = serviceType.toUpperCase();

  // Check for numbered instances (e.g., QBITTORRENT_1_URL, QBITTORRENT_2_URL)
  const instancePattern = new RegExp(`^${upperServiceType}_(\\d+)_`);
  const instanceNumbers = new Set();

  envVars.forEach((key) => {
    const match = key.match(instancePattern);
    if (match) {
      const instanceNumber = Number.parseInt(match[1], 10);
      if (Number.isFinite(instanceNumber)) {
        instanceNumbers.add(instanceNumber);
      }
    }
  });

  // Sort instance numbers
  const sortedInstances = Array.from(instanceNumbers).sort((a, b) => a - b);

  // Build instance configurations
  sortedInstances.forEach((instanceNum) => {
    const prefix = `${upperServiceType}_${instanceNum}_`;
    const instanceConfig = {
      instanceId: `${serviceType}_${instanceNum}`,
      instanceNumber: instanceNum,
    };

    // Collect all env vars for this instance
    envVars.forEach((key) => {
      if (key.startsWith(prefix)) {
        const configKey = key.substring(prefix.length).toLowerCase();
        instanceConfig[configKey] = process.env[key];
      }
    });

    instances.push(instanceConfig);
  });

  // If no numbered instances found, check for legacy single instance config
  if (instances.length === 0) {
    const legacyConfig = {};
    const legacyPrefix = `${upperServiceType}_`;
    let hasLegacyConfig = false;

    envVars.forEach((key) => {
      if (key.startsWith(legacyPrefix) && !key.match(/^\w+_\d+_/)) {
        const configKey = key.substring(legacyPrefix.length).toLowerCase();
        legacyConfig[configKey] = process.env[key];
        hasLegacyConfig = true;
      }
    });

    if (hasLegacyConfig) {
      instances.push({
        instanceId: serviceType,
        instanceNumber: 1,
        ...legacyConfig,
      });
    }
  }

  return instances;
};

const getConfig = () => ({
  // Authentication
  auth: {
    username: process.env.AUTH_USERNAME,
    passwordHash: process.env.AUTH_PASSWORD_HASH,
    jwtSecret: process.env.JWT_SECRET,
  },

  // Bitcoin configuration (optional)
  bitcoin: {
    onionHost: process.env.BITCOIN_ONION_URL,
    rpcUser: process.env.BITCOIN_RPC_USER,
    rpcPassword: process.env.BITCOIN_RPC_PASSWORD,
    rpcPort: envInt("BITCOIN_RPC_PORT") || 8332,
    torProxy: process.env.BITCOIN_TOR_PROXY || "socks5h://127.0.0.1:9050",
  },

  // AdGuard configuration (optional)
  adguard: {
    baseUrl: process.env.ADGUARD_MAIN_URL,
    authToken: process.env.ADGUARD_MAIN_AUTH,
    timeout: envInt("ADGUARD_TIMEOUT") || 10000,
  },

  // Nostrcheck configuration (optional)
  nostrcheck: {
    relayUrl: process.env.NOSTRCHECK_RELAY_URL || null,
    webUrl: process.env.NOSTRCHECK_WEB_URL || null,
    enabled: envBool("NOSTRCHECK_ENABLED", false),
  },

  // Server configuration
  server: {
    port: envInt("PORT") || 3001,
    nodeEnv: process.env.NODE_ENV || "development",
    frontendUrl: process.env.FRONTEND_URL,
  },

  // Enabled services configuration
  enabledServices: parseEnabledServices(),

  // Service instances parser
  getServiceInstances: parseServiceInstances,
});

// Cached config for use across the application (avoids re-parsing process.env)
const cachedConfig = getConfig();

export { validateEnvironment, getConfig, cachedConfig };
