// Constants for the application
export const APP_CONFIG = {
  // Polling intervals (in milliseconds)
  ADGUARD_REFRESH_INTERVAL: 15000, // 15 seconds
  TOR_REFRESH_INTERVAL: 300000, // 5 minutes
  ROON_REFRESH_INTERVAL: 30000, // 30 seconds

  // API timeouts
  API_TIMEOUT: 10000, // 10 seconds
  BITCOIN_API_TIMEOUT: 120000, // 120 seconds (Bitcoin queries through Tor are slow)

  // UI constants
  ANIMATION_DURATION: 200,
  DEBOUNCE_DELAY: 300,

  // Data formatting
  LARGE_NUMBER_THRESHOLD: 1000,
  TIME_DISPLAY_THRESHOLDS: {
    SECONDS: 60,
    MINUTES: 3600,
    HOURS: 86400,
  },

  // External URLs
  TOR_METRICS_BASE_URL: "https://metrics.torproject.org/rs.html#search",
} as const;

export const STATUS_COLORS = {
  online: "text-green-600",
  offline: "text-red-600",
  warning: "text-yellow-600",
  maintenance: "text-blue-600",
} as const;

export const RELAY_TYPE_COLORS = {
  exit: "text-red-600",
  relay: "text-blue-600",
  bridge: "text-purple-600",
  client: "text-green-600",
} as const;
