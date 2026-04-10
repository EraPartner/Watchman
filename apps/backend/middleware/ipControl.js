// IP-based access control (whitelist/blacklist)
import logger from "./logger.js";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getRequestIp, isLocalhostIp, normalizeIp } from "../utils/ip.js";

class IPControlManager {
  constructor() {
    this.whitelist = new Set();
    this.blacklist = new Set();
    this.tempBlacklist = new Map(); // IP -> expiry timestamp
    this._hasNonLocalhost = false;
    this._initialized = false;
    this.configPath = path.join(process.cwd(), "config", "ip-control.json");

    this.loadConfig().finally(() => {
      this._initialized = true;
    });

    // Cleanup expired temp blocks every minute
    this._cleanupInterval = setInterval(() => this.cleanupTempBlocks(), 60000);
    this._cleanupInterval.unref();
  }

  _updateHasNonLocalhost() {
    this._hasNonLocalhost = Array.from(this.whitelist).some(
      (ip) => !isLocalhostIp(ip)
    );
  }

  _normalizeList(list = []) {
    return new Set(Array.from(list || []).map((ip) => normalizeIp(ip)));
  }

  async loadConfig() {
    try {
      if (existsSync(this.configPath)) {
        const data = await readFile(this.configPath, "utf-8");
        const config = JSON.parse(data);

        this.whitelist = this._normalizeList(config.whitelist || []);
        this.blacklist = this._normalizeList(config.blacklist || []);
        this._updateHasNonLocalhost();

        logger.info("IP control config loaded", {
          whitelistCount: this.whitelist.size,
          blacklistCount: this.blacklist.size,
        });
      } else {
        // Create default config with localhost whitelisted
        this.whitelist.add(normalizeIp("127.0.0.1"));
        this.whitelist.add(normalizeIp("::1"));
        this._updateHasNonLocalhost();
        await this.saveConfig();
      }
    } catch (error) {
      logger.error("Failed to load IP control config", {
        error: error.message,
      });
      // Default to localhost only
      this.whitelist.add(normalizeIp("127.0.0.1"));
      this.whitelist.add(normalizeIp("::1"));
      this._updateHasNonLocalhost();
    }
  }

  async saveConfig() {
    try {
      const config = {
        whitelist: Array.from(this.whitelist),
        blacklist: Array.from(this.blacklist),
      };

      await writeFile(this.configPath, JSON.stringify(config, null, 2));
      logger.info("IP control config saved");
    } catch (error) {
      logger.error("Failed to save IP control config", {
        error: error.message,
      });
    }
  }

  addToWhitelist(ip) {
    const normalized = normalizeIp(ip);
    this.whitelist.add(normalized);
    this._updateHasNonLocalhost();
    this.blacklist.delete(normalized); // Remove from blacklist if present
    return this.saveConfig();
  }

  removeFromWhitelist(ip) {
    this.whitelist.delete(normalizeIp(ip));
    this._updateHasNonLocalhost();
    return this.saveConfig();
  }

  addToBlacklist(ip) {
    const normalized = normalizeIp(ip);
    this.blacklist.add(normalized);
    this._updateHasNonLocalhost();
    this.whitelist.delete(normalized); // Remove from whitelist if present
    return this.saveConfig();
  }

  removeFromBlacklist(ip) {
    this.blacklist.delete(normalizeIp(ip));
    return this.saveConfig();
  }

  tempBlock(ip, durationMs = 3600000) {
    // 1 hour default
    const expiresAt = Date.now() + durationMs;
    const normalized = normalizeIp(ip);
    this.tempBlacklist.set(normalized, expiresAt);

    logger.warn("IP temporarily blocked", {
      ip: normalized,
      duration: durationMs / 1000 / 60 + " minutes",
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  cleanupTempBlocks() {
    const now = Date.now();
    for (const [ip, expiresAt] of this.tempBlacklist.entries()) {
      if (now >= expiresAt) {
        this.tempBlacklist.delete(ip);
        logger.info("Temporary IP block expired", { ip });
      }
    }
  }

  isAllowed(ip) {
    const normalizedIp = normalizeIp(ip);

    // Safe startup behavior: while config is loading, only allow localhost.
    if (!this._initialized) {
      return isLocalhostIp(normalizedIp);
    }

    // Check temp blacklist first
    if (this.tempBlacklist.has(normalizedIp)) {
      const expiresAt = this.tempBlacklist.get(normalizedIp);
      if (Date.now() < expiresAt) {
        return false;
      }
      this.tempBlacklist.delete(normalizedIp);
    }

    // Permanent blacklist
    if (this.blacklist.has(normalizedIp)) {
      return false;
    }

    // If whitelist is empty or only has localhost, allow all
    if (!this._hasNonLocalhost) {
      return true;
    }

    // Whitelist mode: only allow whitelisted IPs
    return this.whitelist.has(normalizedIp);
  }

  getStats() {
    return {
      whitelist: Array.from(this.whitelist),
      blacklist: Array.from(this.blacklist),
      tempBlacklist: Array.from(this.tempBlacklist.entries()).map(
        ([ip, expiry]) => ({
          ip,
          expiresAt: new Date(expiry).toISOString(),
        })
      ),
    };
  }
}

export const ipControl = new IPControlManager();

/**
 * Middleware to enforce IP access control
 */
export function enforceIPControl(req, res, next) {
  const ip = getRequestIp(req);

  if (!ipControl.isAllowed(ip)) {
    logger.warn("Access denied for blocked IP", {
      ip,
      path: req.path,
      userAgent: req.get("user-agent"),
    });

    return res.status(403).json({
      error: "Access denied",
    });
  }

  next();
}

/**
 * Middleware for admin routes only - requires whitelist
 */
export function requireWhitelistedIP(req, res, next) {
  const ip = getRequestIp(req);

  if (!ipControl.whitelist.has(ip)) {
    logger.warn("Non-whitelisted IP attempted admin access", {
      ip,
      path: req.path,
    });

    return res.status(403).json({
      error: "Access denied. This endpoint requires IP whitelisting.",
    });
  }

  next();
}
