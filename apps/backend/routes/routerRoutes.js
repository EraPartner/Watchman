import { getErrorMessage, getServiceContext } from "./routeUtils.js";

const ALLOWED_ROUTER_SERVICES = new Set(["beryl", "telenet"]);

export function registerRouterRoutes(
  app,
  {
    controlLimiter,
    requireAuth,
    verifyCsrf,
    requireAnyServiceEnabled,
    validateQuery,
    sanitizeString,
    parsePagination,
    isValidIPv4,
    paginate,
    getRouterArpData,
    getServiceManager,
    logger,
  }
) {
  app.get(
    "/api/router/arp",
    controlLimiter,
    requireAuth,
    verifyCsrf,
    requireAnyServiceEnabled("beryl", "telenet"),
    validateQuery({
      service: {
        required: true,
        validator: (value) =>
          typeof value === "string" &&
          ALLOWED_ROUTER_SERVICES.has(sanitizeString(value, 32)),
        sanitizer: (value) => sanitizeString(value, 32),
      },
    }),
    parsePagination({
      pageParam: "page",
      limitParam: "limit",
      defaultLimit: 50,
      maxLimit: 100,
    }),
    async (req, res) => {
      try {
        const serviceName =
          typeof req.query.service === "string" ? req.query.service : null;

        // STRICT validation: only allow predefined router services
        if (!serviceName || !ALLOWED_ROUTER_SERVICES.has(serviceName)) {
          return res
            .status(400)
            .json({ error: "Invalid service. Allowed: beryl, telenet" });
        }

        const { service: svc } = getServiceContext(
          getServiceManager,
          serviceName
        );
        if (!svc)
          return res
            .status(404)
            .json({ error: `Service '${serviceName}' not found` });

        const host = svc.host || null;
        if (!host)
          return res.status(400).json({
            error: `Service '${serviceName}' does not have a configured host`,
          });

        // Validate host is a proper IP address (prevent command injection)
        if (!isValidIPv4(host)) {
          logger.error("Router ARP: invalid host IP", { host, serviceName });
          return res
            .status(500)
            .json({ error: "Invalid router host configuration" });
        }

        const { hosts, lanHosts, note } = await getRouterArpData({
          serviceIp: host,
        });

        // Apply pagination to the hosts array
        const paginatedHosts = paginate(hosts, req.pagination);
        return res.json({
          count: hosts.length,
          hosts: paginatedHosts.data,
          pagination: paginatedHosts.pagination,
          lan: {
            count: lanHosts.length,
            hosts: lanHosts,
          },
          note,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("ARP lookup failed", {
          error: message,
        });
        return res.status(500).json({
          error: "Failed to run ARP lookup",
          message,
        });
      }
    }
  );
}
