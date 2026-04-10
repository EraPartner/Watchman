import { getErrorMessage, getServiceContext } from "./routeUtils.js";

export function registerControlRoutes(
  app,
  {
    controlLimiter,
    requireAuth,
    verifyCsrf,
    requireServiceEnabled,
    requireBoolean,
    clearCache,
    getServiceManager,
    logger,
  }
) {
  app.post(
    "/api/cache/clear",
    controlLimiter,
    requireAuth,
    verifyCsrf,
    (req, res) => {
      const { type } = req.body || {};

      if (
        type !== undefined &&
        (typeof type !== "string" || type.trim().length === 0)
      ) {
        return res.status(400).json({ error: "Invalid cache type" });
      }

      clearCache(type);
      return res.json({
        success: true,
        message: `Cache cleared: ${type || "all"}`,
      });
    }
  );

  app.post(
    "/api/adguard/protection",
    controlLimiter,
    requireAuth,
    verifyCsrf,
    requireServiceEnabled("adguard"),
    requireBoolean("enabled"),
    async (req, res) => {
      try {
        const { service: adguardService } = getServiceContext(
          getServiceManager,
          "adguard"
        );
        if (!adguardService) {
          return res
            .status(503)
            .json({ error: "AdGuard service not configured" });
        }

        const { enabled, duration } = req.body;

        if (duration !== undefined && typeof duration !== "number") {
          return res
            .status(400)
            .json({ error: "Duration must be a number (seconds)" });
        }

        await adguardService.setProtection(enabled, duration);
        logger.service(
          "adguard",
          `Protection ${enabled ? "enabled" : "disabled"}`
        );

        clearCache("health");
        clearCache("stats");

        return res.json({ success: true });
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("AdGuard protection toggle failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to toggle AdGuard protection",
        });
      }
    }
  );
}
