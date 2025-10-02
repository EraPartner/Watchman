const dotenv = require("dotenv");
dotenv.config();

// Environment variable validation
const requiredEnvVars = [
  "BITCOIN_ONION_HOST",
  "BITCOIN_RPC_USER",
  "BITCOIN_RPC_AUTH_HASH",
  "BITCOIN_RPC_SESSION_PASSWORD",
  "ADGUARD_BASE_URL",
  "ADGUARD_AUTH_TOKEN",
];

const validateEnvironment = () => {
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((envVar) => console.error(`  - ${envVar}`));
    console.error(
      "\n📝 Please check your .env.local.local file and ensure all required variables are set."
    );
    process.exit(1);
  }

  console.log("✅ All required environment variables are present");
};

const getConfig = () => ({
  bitcoin: {
    onionHost: process.env.BITCOIN_ONION_HOST,
    rpcUser: process.env.BITCOIN_RPC_USER,
    rpcAuthHash: process.env.BITCOIN_RPC_AUTH_HASH,
    rpcPort: parseInt(process.env.BITCOIN_RPC_PORT) || 8332,
    torProxy: process.env.BITCOIN_TOR_PROXY || "socks5h://127.0.0.1:9050",
    sessionPassword: process.env.BITCOIN_RPC_SESSION_PASSWORD,
  },
  adguard: {
    baseUrl: process.env.ADGUARD_BASE_URL,
    authToken: process.env.ADGUARD_AUTH_TOKEN,
    timeout: parseInt(process.env.ADGUARD_TIMEOUT) || 10000,
  },
  nostrcheck: {
    // Optional: frontend can read this to point to a LAN relay (ws:// or wss://)
    relayUrl: process.env.NOSTRCHECK_RELAY_URL || null,
    // A clickable web URL (http(s)://...) to open the relay's web UI if available
    webUrl: process.env.NOSTRCHECK_WEB_URL || null,
    enabled:
      (process.env.NOSTRCHECK_ENABLED || "false").toLowerCase() === "true",
  },
  server: {
    port: parseInt(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || "development",
  },
});

module.exports = {
  validateEnvironment,
  getConfig,
};
