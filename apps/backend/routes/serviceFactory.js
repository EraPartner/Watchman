/**
 * Service Route Factory
 *
 * Creates standardized Express routers for service endpoints.
 * Eliminates duplicated route handler boilerplate across 13+ services
 * by generating consistent status, stats, and update-check routes
 * from a single factory function.
 *
 * @fileoverview Route factory for service endpoints
 * @author Watchman Team
 */

import express from "express";
import { logger } from "../middleware/logger.js";
import { getErrorMessage, getServiceContext } from "./routeUtils.js";

function toDisplayName(serviceName) {
  return serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
}

/**
 * Create a standardized set of routes for a service.
 *
 * Generates:
 *   GET /status  - Health check (rate-limited, cached, no authentication required)
 *   GET /stats   - Service stats (auth required, cached)
 *
 * @param {string} serviceName - Service identifier (e.g., "adguard", "bitcoin")
 * @param {Function} getServiceManager - Function that returns the ServiceManager instance
 * @param {Object} middleware - Required middleware functions
 * @param {Function} middleware.healthLimiter - Rate limiter for health endpoints
 * @param {Function} middleware.requireServiceEnabled - Service enabled gate
 * @param {Function} middleware.requireAuth - Authentication middleware
 * @param {Function} middleware.healthCacheMiddleware - Cache for health responses
 * @param {Function} middleware.statsCacheMiddleware - Cache for stats responses
 * @returns {express.Router} Configured router with service routes
 */
export function createServiceRoutes(
  serviceName,
  getServiceManager,
  middleware
) {
  const router = express.Router();
  const {
    healthLimiter,
    requireServiceEnabled,
    requireAuth,
    healthCacheMiddleware,
    statsCacheMiddleware,
  } = middleware;

  const enabledGate = requireServiceEnabled(serviceName);
  const displayName = toDisplayName(serviceName);

  // ── GET /status ──────────────────────────────────────────────
  // Health check: rate-limited, cached, no authentication required
  router.get(
    "/status",
    healthLimiter,
    enabledGate,
    healthCacheMiddleware,
    async (req, res) => {
      try {
        const { serviceManager: sm, service: svc } = getServiceContext(
          getServiceManager,
          serviceName
        );
        if (!svc) {
          return res.status(503).json({
            error: `${displayName} service not configured`,
            status: "offline",
          });
        }

        const health = await sm.getServiceHealth(serviceName);
        res.json(health);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error(`${displayName} status connection failed`, {
          error: message,
        });
        res.status(500).json({
          error: `Failed to fetch ${displayName} status`,
          status: "offline",
          message,
        });
      }
    }
  );

  // ── GET /stats ───────────────────────────────────────────────
  // Service stats: auth required, cached
  router.get(
    "/stats",
    requireAuth,
    enabledGate,
    statsCacheMiddleware,
    async (req, res) => {
      try {
        const { serviceManager: sm, service: svc } = getServiceContext(
          getServiceManager,
          serviceName
        );
        if (!svc) {
          return res.status(503).json({
            error: `${displayName} service not configured`,
          });
        }

        const stats = await sm.getServiceStats(serviceName);
        res.json(stats);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error(`${displayName} stats connection failed`, {
          error: message,
        });
        res.status(500).json({
          error: `Failed to fetch ${displayName} stats`,
          message,
        });
      }
    }
  );

  return router;
}

/**
 * Create an update-check route for a service.
 *
 * Generates:
 *   GET /updates - Version update check (cached, no auth)
 *
 * Only use for services that implement checkForUpdates().
 *
 * @param {string} serviceName - Service identifier
 * @param {Function} getServiceManager - Function that returns the ServiceManager instance
 * @param {Object} middleware - Required middleware functions
 * @param {Function} middleware.requireServiceEnabled - Service enabled gate
 * @param {Function} middleware.statsCacheMiddleware - Cache for responses
 * @returns {express.Router} Configured router with updates route
 */
export function createUpdatesRoute(serviceName, getServiceManager, middleware) {
  const router = express.Router();
  const { requireServiceEnabled, statsCacheMiddleware } = middleware;

  const enabledGate = requireServiceEnabled(serviceName);
  const displayName = toDisplayName(serviceName);

  router.get(
    "/updates",
    enabledGate,
    statsCacheMiddleware,
    async (req, res) => {
      try {
        const { service: svc } = getServiceContext(
          getServiceManager,
          serviceName
        );
        if (!svc) {
          return res.status(503).json({
            error: `${displayName} service not configured`,
          });
        }

        const updateInfo = await svc.checkForUpdates();
        res.json(updateInfo);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error(`${displayName} update check failed`, {
          error: message,
        });
        res.status(500).json({
          error: `Failed to check for ${displayName} updates`,
          message,
        });
      }
    }
  );

  return router;
}
