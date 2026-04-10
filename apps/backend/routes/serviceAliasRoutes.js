import { getErrorMessage, getServiceContext } from "./routeUtils.js";

export function registerServiceAliasRoutes(
  app,
  {
    healthLimiter,
    requireServiceEnabled,
    healthCacheMiddleware,
    statsCacheMiddleware,
    requireAuth,
    getServiceManager,
    logger,
  }
) {
  const getConfiguredService = (serviceName) =>
    getServiceContext(getServiceManager, serviceName);

  const createServiceUnavailableResponse = (res, error) =>
    res.status(503).json({ error });

  app.get(
    "/api/bitcoin/health",
    healthLimiter,
    requireServiceEnabled("bitcoin"),
    healthCacheMiddleware,
    async (req, res) => {
      try {
        const { serviceManager, service } = getConfiguredService("bitcoin");
        if (!service) {
          return createServiceUnavailableResponse(res, {
            error: "Bitcoin service not configured",
            status: "offline",
          });
        }

        const health = await serviceManager.getServiceHealth("bitcoin", {
          signal: req.requestAbortSignal,
        });
        return res.json(health);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("Bitcoin health connection failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to fetch Bitcoin health",
          status: "offline",
          message,
        });
      }
    }
  );

  app.get(
    "/api/tor/health",
    healthLimiter,
    requireServiceEnabled("tor"),
    healthCacheMiddleware,
    async (req, res) => {
      try {
        const { serviceManager, service } = getConfiguredService("tor");
        if (!service) {
          return createServiceUnavailableResponse(
            res,
            "Tor service not configured"
          );
        }

        const health = await serviceManager.getServiceHealth("tor", {
          signal: req.requestAbortSignal,
        });
        return res.json(health);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("Tor health check connection failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to check Tor health",
          message,
        });
      }
    }
  );

  app.get(
    "/api/tor/relay/:nickname?",
    requireServiceEnabled("tor"),
    statsCacheMiddleware,
    async (req, res) => {
      try {
        const { serviceManager, service } = getConfiguredService("tor");
        if (!service) {
          return createServiceUnavailableResponse(
            res,
            "Tor service not configured"
          );
        }

        const stats = await serviceManager.getServiceStats("tor");
        return res.json(stats);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("Tor relay connection failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to fetch Tor relay data",
          message,
        });
      }
    }
  );

  app.get(
    "/api/ipfs/updates",
    requireAuth,
    requireServiceEnabled("ipfs"),
    statsCacheMiddleware,
    async (req, res) => {
      try {
        const { service } = getConfiguredService("ipfs");
        if (!service) {
          return createServiceUnavailableResponse(
            res,
            "IPFS service not configured"
          );
        }

        const updateInfo = await service.checkForUpdates();
        return res.json(updateInfo);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("IPFS update check failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to check for IPFS updates",
          message,
        });
      }
    }
  );
}
