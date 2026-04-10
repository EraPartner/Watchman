import { getErrorMessage, getServiceContext } from "./routeUtils.js";

export function registerInstanceServiceRoutes(
  app,
  {
    healthLimiter,
    validateParams,
    isValidServiceId,
    healthCacheMiddleware,
    requireAuth,
    statsCacheMiddleware,
    getServiceManager,
    logger,
  }
) {
  app.get(
    "/api/:serviceId(\\w+_\\d+)/status",
    healthLimiter,
    validateParams({
      serviceId: {
        validator: isValidServiceId,
      },
    }),
    healthCacheMiddleware,
    async (req, res) => {
      try {
        const { serviceId } = req.params;
        const { serviceManager, service } = getServiceContext(
          getServiceManager,
          serviceId
        );
        if (!service) {
          return res.status(404).json({
            error: `Service '${serviceId}' not found`,
            status: "offline",
          });
        }

        const health = await serviceManager.getServiceHealth(serviceId, {
          signal: req.requestAbortSignal,
        });
        res.json(health);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error(`Service ${req.params.serviceId} status failed`, {
          error: message,
          serviceId: req.params.serviceId,
        });
        res.status(500).json({
          error: `Failed to fetch ${req.params.serviceId} status`,
          status: "offline",
          message,
        });
      }
    }
  );

  app.get(
    "/api/:serviceId(\\w+_\\d+)/stats",
    requireAuth,
    validateParams({
      serviceId: {
        validator: isValidServiceId,
      },
    }),
    statsCacheMiddleware,
    async (req, res) => {
      try {
        const { serviceId } = req.params;
        const { serviceManager, service } = getServiceContext(
          getServiceManager,
          serviceId
        );
        if (!service) {
          return res.status(404).json({
            error: `Service '${serviceId}' not found`,
          });
        }

        const stats = await serviceManager.getServiceStats(serviceId);
        res.json(stats);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error(`Service ${req.params.serviceId} stats failed`, {
          error: message,
          serviceId: req.params.serviceId,
        });
        res.status(500).json({
          error: `Failed to fetch ${req.params.serviceId} stats`,
          message,
        });
      }
    }
  );
}
