import { cachedConfig } from "../config.js";

/**
 * Middleware to check if a service is enabled before processing the request.
 * Returns 404 Not Found if the service is not enabled.
 *
 * @param {string} serviceName - The service name to check (e.g., "bitcoin", "adguard")
 * @returns {Function} Express middleware function
 */
export function requireServiceEnabled(serviceName) {
  return (req, res, next) => {
    const enabledServices = cachedConfig.enabledServices;

    if (!enabledServices.has(serviceName.toLowerCase())) {
      return res.status(404).json({
        error: `Service '${serviceName}' is not enabled`,
        message: `This service is not included in ENABLED_SERVICES configuration`,
      });
    }

    next();
  };
}

/**
 * Middleware factory that requires multiple services to be enabled.
 * Returns 404 if ANY of the specified services is not enabled.
 *
 * @param {...string} serviceNames - Service names to check
 * @returns {Function} Express middleware function
 */
export function requireAnyServiceEnabled(...serviceNames) {
  return (req, res, next) => {
    const enabledServices = cachedConfig.enabledServices;

    const anyEnabled = serviceNames.some((name) =>
      enabledServices.has(name.toLowerCase())
    );

    if (!anyEnabled) {
      return res.status(404).json({
        error: `None of the required services are enabled`,
        message: `At least one of [${serviceNames.join(", ")}] must be enabled`,
        services: serviceNames,
      });
    }

    next();
  };
}

export default { requireServiceEnabled, requireAnyServiceEnabled };
