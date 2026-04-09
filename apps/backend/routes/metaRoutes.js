import { getErrorMessage } from "./routeUtils.js";

async function checkServicesHealth(getServiceManager, services) {
  const serviceManager = getServiceManager();
  const healthPromises = services.map(async (serviceName) => {
    try {
      const health = await Promise.race([
        serviceManager.getServiceHealth(serviceName),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), 5000)
        ),
      ]);
      return [serviceName, health];
    } catch (error) {
      const message = getErrorMessage(error);
      return [
        serviceName,
        {
          status: "offline",
          error: message,
          timestamp: new Date().toISOString(),
        },
      ];
    }
  });

  const results = await Promise.all(healthPromises);
  const healthResults = {};
  for (const [serviceName, health] of results) {
    healthResults[serviceName] = health;
  }
  return healthResults;
}

export function registerMetaRoutes(
  app,
  {
    healthLimiter,
    requireAuth,
    sanitizeString,
    isValidServiceId,
    cachedConfig,
    getFrontendConfig,
    getServiceManager,
    logger,
  }
) {
  app.get(
    "/api/services/health",
    healthLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const enabledServices = cachedConfig.enabledServices;
        const services = Array.from(enabledServices);
        const healthResults = await checkServicesHealth(
          getServiceManager,
          services
        );

        return res.json({
          services: healthResults,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("Services health check failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to check services health",
          message,
        });
      }
    }
  );

  app.post(
    "/api/services/health-batch",
    healthLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const MAX_BATCH_SIZE = 25;
        const rawServices = Array.isArray(req.body?.services)
          ? req.body.services
          : null;

        if (!rawServices) {
          return res.status(400).json({
            error: "Invalid request body. Expected { services: string[] }",
          });
        }

        if (rawServices.length > MAX_BATCH_SIZE) {
          return res.status(400).json({
            error: `Too many services requested. Maximum ${MAX_BATCH_SIZE}`,
          });
        }

        const services = [];
        const seen = new Set();

        for (const rawServiceName of rawServices) {
          const serviceName = sanitizeString(rawServiceName, 64);
          if (!serviceName || !isValidServiceId(serviceName)) {
            return res.status(400).json({
              error: `Invalid service id: ${String(rawServiceName)}`,
            });
          }

          if (!seen.has(serviceName)) {
            seen.add(serviceName);
            services.push(serviceName);
          }
        }

        if (services.length === 0) {
          return res.json({});
        }

        const healthResults = await checkServicesHealth(
          getServiceManager,
          services
        );
        return res.json(healthResults);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("Batch services health check failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to check batch services health",
          message,
        });
      }
    }
  );

  app.get("/api/config/frontend", getFrontendConfig);

  app.get("/api/services/instances", healthLimiter, requireAuth, (req, res) => {
    try {
      const serviceManager = getServiceManager();
      const serviceTypes = serviceManager.getServiceTypes();
      const instancesInfo = {};

      for (const serviceType of serviceTypes) {
        const instances = serviceManager.getServiceInstances(serviceType);
        instancesInfo[serviceType] = {
          count: instances.length,
          instances: instances.map((instanceId) => ({
            id: instanceId,
            type: serviceType,
          })),
        };
      }

      return res.json({
        instances: instancesInfo,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error("Failed to get service instances", {
        error: message,
      });
      return res.status(500).json({
        error: "Failed to get service instances",
        message,
      });
    }
  });
}
