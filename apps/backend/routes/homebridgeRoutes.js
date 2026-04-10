import { getErrorMessage, getServiceContext } from "./routeUtils.js";

function extractHomebridgeAccessories(accessoriesResult) {
  if (Array.isArray(accessoriesResult)) {
    return accessoriesResult;
  }

  const candidates = [
    accessoriesResult?.data,
    accessoriesResult?.accessories,
    accessoriesResult?.raw,
    accessoriesResult?.raw?.accessories,
    accessoriesResult?.lastData?.data,
    accessoriesResult?.lastData?.accessories,
    accessoriesResult?.lastData?.raw,
    accessoriesResult?.lastData?.raw?.accessories,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

export function registerHomebridgeRoutes(
  app,
  {
    requireServiceEnabled,
    statsCacheMiddleware,
    requireAuth,
    parsePagination,
    paginate,
    getServiceManager,
    logger,
  }
) {
  const getConfiguredService = () =>
    getServiceContext(getServiceManager, "homebridge");

  app.get(
    "/api/status/homebridge-version",
    requireServiceEnabled("homebridge"),
    statsCacheMiddleware,
    requireAuth,
    async (req, res) => {
      try {
        const { serviceManager, service: svc } = getConfiguredService();
        if (!svc) {
          return res
            .status(503)
            .json({ error: "Homebridge service not configured" });
        }

        if (typeof svc.getVersion === "function") {
          const ver = await svc.getVersion();
          return res.json(ver);
        }

        const stats = await svc.getStats();
        return res.json({
          version: stats?.data?.version || stats?.version || null,
          raw: stats,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("/api/status/homebridge-version failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to fetch Homebridge version",
          message,
        });
      }
    }
  );

  app.get(
    "/api/status/server-information",
    requireServiceEnabled("homebridge"),
    statsCacheMiddleware,
    requireAuth,
    async (req, res) => {
      try {
        const { serviceManager, service: svc } = getConfiguredService();
        if (!svc) {
          return res
            .status(503)
            .json({ error: "Homebridge service not configured" });
        }

        if (typeof svc.getServerInformation === "function") {
          const info = await svc.getServerInformation();
          return res.json(info);
        }

        const health = await serviceManager.getServiceHealth("homebridge", {
          signal: req.requestAbortSignal,
        });
        return res.json({
          data: health && health.data ? health.data : null,
          raw: health,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("/api/status/server-information failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to fetch server information",
          message,
        });
      }
    }
  );

  app.get(
    "/api/accessories",
    requireServiceEnabled("homebridge"),
    statsCacheMiddleware,
    requireAuth,
    parsePagination({
      pageParam: "page",
      limitParam: "limit",
      defaultLimit: 50,
      maxLimit: 100,
    }),
    async (req, res) => {
      try {
        const { service: svc } = getConfiguredService();
        if (!svc) {
          return res
            .status(503)
            .json({ error: "Homebridge service not configured" });
        }

        if (typeof svc.getAccessories !== "function") {
          return res.status(501).json({
            error:
              "Accessories endpoint not implemented for this Homebridge service",
          });
        }

        const accessoriesResult = await svc.getAccessories();
        const accessories = extractHomebridgeAccessories(accessoriesResult);
        const paginatedAccessories = paginate(accessories, req.pagination);

        if (
          !Array.isArray(accessoriesResult) &&
          accessoriesResult?.error &&
          accessories.length === 0
        ) {
          return res.json({
            ...paginatedAccessories,
            warning: "Homebridge accessories temporarily unavailable",
            message: accessoriesResult.error,
            timestamp: accessoriesResult.timestamp,
          });
        }

        return res.json(paginatedAccessories);
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("/api/accessories failed", { error: message });
        return res.status(500).json({
          error: "Failed to fetch accessories",
          message,
        });
      }
    }
  );
}
