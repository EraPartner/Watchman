import dotenv from "dotenv";
dotenv.config();

// Environment variable validation
const requiredEnvVars = [
  "AUTH_USERNAME",
  "AUTH_PASSWORD_HASH",
  "JWT_SECRET",
  "FRONTEND_URL",
];

// Optional but recommended for production
const recommendedEnvVars = ["ADGUARD_BASE_URL", "ADGUARD_AUTH_TOKEN"];

const validateEnvironment = () => {
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  const missingRecommended = recommendedEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((envVar) => console.error(`  - ${envVar}`));
    console.error(
      "\n📝 Please check your .env.local file and ensure all required variables are set."
    );
    console.error("💡 Use backend/.env.example as a template.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && missingRecommended.length > 0) {
    console.warn(
      "⚠️  Missing recommended environment variables for production:"
    );
    missingRecommended.forEach((envVar) => console.warn(`  - ${envVar}`));
  }

  // Validate JWT_SECRET strength in production
  if (
    process.env.NODE_ENV === "production" &&
    process.env.JWT_SECRET &&
    process.env.JWT_SECRET.length < 32
  ) {
    console.error(
      "❌ JWT_SECRET must be at least 32 characters long in production"
    );
    process.exit(1);
  }

  // Validate FRONTEND_URL format
  if (
    process.env.FRONTEND_URL &&
    !process.env.FRONTEND_URL.match(/^https?:\/\/.+/)
  ) {
    console.error("❌ FRONTEND_URL must be a valid URL (http:// or https://)");
    process.exit(1);
  }

  console.log("✅ Environment validation passed");
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
    rpcPort: parseInt(process.env.BITCOIN_RPC_PORT) || 8332,
    torProxy: process.env.BITCOIN_TOR_PROXY || "socks5h://127.0.0.1:9050",
  },

  // AdGuard configuration (optional)
  adguard: {
    baseUrl: process.env.ADGUARD_MAIN_URL,
    authToken: process.env.ADGUARD_MAIN_AUTH,
    timeout: parseInt(process.env.ADGUARD_TIMEOUT) || 10000,
  },

  // Nostrcheck configuration (optional)
  nostrcheck: {
    relayUrl: process.env.NOSTRCHECK_RELAY_URL || null,
    webUrl: process.env.NOSTRCHECK_WEB_URL || null,
    enabled:
      (process.env.NOSTRCHECK_ENABLED || "false").toLowerCase() === "true",
  },

  // Server configuration
  server: {
    port: parseInt(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV || "development",
    frontendUrl: process.env.FRONTEND_URL,
  },
});

export { validateEnvironment, getConfig };
