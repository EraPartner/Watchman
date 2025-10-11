// IP-based access control (whitelist/blacklist)
import logger from "./logger.js";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

class IPControlManager {
  constructor() {
    this.whitelist = new Set();
    this.blacklist = new Set();
    this.tempBlacklist = new Map(); // IP -> expiry timestamp
    this.configPath = path.join(process.cwd(), "config", "ip-control.json");

    this.loadConfig();

    // Cleanup expired temp blocks every minute
    setInterval(() => this.cleanupTempBlocks(), 60000);
  }

  async loadConfig() {
    try {
      if (existsSync(this.configPath)) {
        const data = await readFile(this.configPath, "utf-8");
        const config = JSON.parse(data);

        this.whitelist = new Set(config.whitelist || []);
        this.blacklist = new Set(config.blacklist || []);

        logger.info("IP control config loaded", {
          whitelistCount: this.whitelist.size,
          blacklistCount: this.blacklist.size,
        });
      } else {
        // Create default config with localhost whitelisted
        this.whitelist.add("127.0.0.1");
        this.whitelist.add("::1");
        await this.saveConfig();
      }
    } catch (error) {
      logger.error("Failed to load IP control config", {
        error: error.message,
      });
      // Default to localhost only
      this.whitelist.add("127.0.0.1");
      this.whitelist.add("::1");
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
    this.whitelist.add(ip);
    this.blacklist.delete(ip); // Remove from blacklist if present
    return this.saveConfig();
  }

  removeFromWhitelist(ip) {
    this.whitelist.delete(ip);
    return this.saveConfig();
  }

  addToBlacklist(ip) {
    this.blacklist.add(ip);
    this.whitelist.delete(ip); // Remove from whitelist if present
    return this.saveConfig();
  }

  removeFromBlacklist(ip) {
    this.blacklist.delete(ip);
    return this.saveConfig();
  }

  tempBlock(ip, durationMs = 3600000) {
    // 1 hour default
    const expiresAt = Date.now() + durationMs;
    this.tempBlacklist.set(ip, expiresAt);

    logger.warn("IP temporarily blocked", {
      ip,
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
    // Check temp blacklist first
    if (this.tempBlacklist.has(ip)) {
      const expiresAt = this.tempBlacklist.get(ip);
      if (Date.now() < expiresAt) {
        return false;
      }
      this.tempBlacklist.delete(ip);
    }

    // Permanent blacklist
    if (this.blacklist.has(ip)) {
      return false;
    }

    // If whitelist is empty or only has localhost, allow all
    const hasNonLocalhost = Array.from(this.whitelist).some(
      (ip) => ip !== "127.0.0.1" && ip !== "::1"
    );

    if (!hasNonLocalhost) {
      return true;
    }

    // Whitelist mode: only allow whitelisted IPs
    return this.whitelist.has(ip);
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
  const ip = req.ip || req.connection.remoteAddress;

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
  const ip = req.ip || req.connection.remoteAddress;

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
