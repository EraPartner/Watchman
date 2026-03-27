/**
 * HTTP Agent Pool
 *
 * Provides shared HTTP/HTTPS agents for connection pooling.
 * Reduces memory usage by sharing connection pools across all services.
 *
 * This follows DRY principle by centralizing HTTP agent creation
 * that was duplicated across BitcoinService, QBittorrentService, HomebridgeService, etc.
 */

import http from "http";
import https from "https";

/**
 * Default keep-alive options
 */
const defaultKeepAliveOptions = {
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 25,
  maxFreeSockets: 10,
  timeout: 60000, // Socket inactivity timeout
};

/**
 * Default HTTPS options
 */
const defaultHttpsOptions = {
  ...defaultKeepAliveOptions,
  rejectUnauthorized: true,
};

/**
 * Create shared HTTP agent
 */
const httpAgent = new http.Agent(defaultKeepAliveOptions);

/**
 * Create shared HTTPS agent
 */
const httpsAgent = new https.Agent(defaultHttpsOptions);

// Set socket timeout for additional protection
httpAgent.on("timeout", (socket) => {
  socket.destroy();
});

httpsAgent.on("timeout", (socket) => {
  socket.destroy();
});

/**
 * Get the appropriate agent for a URL
 * @param {string} url - The URL to check
 * @returns {http.Agent|https.Agent} The appropriate agent
 */
export function getAgentForUrl(url) {
  if (!url) return httpAgent;
  return url.startsWith("https:") ? httpsAgent : httpAgent;
}

/**
 * Get the HTTP agent
 * @returns {http.Agent} The shared HTTP agent
 */
export function getHttpAgent() {
  return httpAgent;
}

/**
 * Get the HTTPS agent
 * @returns {https.Agent} The shared HTTPS agent
 */
export function getHttpsAgent() {
  return httpsAgent;
}

/**
 * Destroy all agents (call on shutdown)
 */
export function destroyAgents() {
  httpAgent.destroy();
  httpsAgent.destroy();
}

// Export agents for direct use
export { httpAgent, httpsAgent };
