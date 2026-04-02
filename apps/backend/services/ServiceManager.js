import { TorManager } from "./TorManager.js";
import { getConfig } from "../config.js";
import { logger } from "../middleware/logger.js";
import {
  serviceFactoryConfigs,
  multiInstanceServices,
} from "./serviceFactoryConfig.js";
import circuitBreakerManager from "../utils/circuitBreaker.js";

export default class ServiceManager {
  constructor() {
    this.services = new Map();
    this.serviceInstances = new Map();
    this.torManager = null;
    this.initialized = false;
  }

  /**
   * Initialize all enabled services using factory pattern
   *
   * Reads configuration and uses the service factory to initialize
   * all enabled services with their respective configurations.
   *
   * @returns {Promise<void>}
   * @throws {Error} If critical service initialization fails
   */
  async initializeServices() {
    logger.progress("Initializing services");

    const config = getConfig();
    const enabledServices = config.enabledServices;

    logger.service(
      "system",
      `Enabled services: ${Array.from(enabledServices).join(", ")}`
    );

    try {
      // Initialize Tor Manager and start Tor (only if tor service is enabled)
      if (enabledServices.has("tor")) {
        this.torManager = new TorManager();
        await this.torManager.initialize();

        logger.progress("Starting Tor proxy");
        await this.torManager.startTor();
      }

      // Initialize services using factory pattern
      for (const [serviceName, serviceConfig] of Object.entries(
        serviceFactoryConfigs
      )) {
        if (!enabledServices.has(serviceName)) {
          continue;
        }

        try {
          const serviceOptions = serviceConfig.getConfig();

          // Skip if config returns null (optional service not configured)
          if (serviceOptions === null) {
            logger.warning(
              `${serviceName} service requested but not configured`
            );
            continue;
          }

          // Create service instance
          const serviceInstance = new serviceConfig.ServiceClass(
            serviceOptions
          );
          this.services.set(serviceName, serviceInstance);

          // Set default instance
          const instanceId = multiInstanceServices.has(serviceName)
            ? serviceName
            : serviceName;
          this.serviceInstances.set(serviceName, [instanceId]);

          // Handle post-initialization (e.g., Homebridge login)
          if (serviceConfig.postInit === "homebridgeLogin") {
            this._startHomebridgeBackgroundLogin(serviceInstance);
          }

          logger.service(serviceName, `${serviceName} service initialized`);
        } catch (error) {
          logger.error(`Failed to initialize ${serviceName} service`, {
            error: error.message,
          });
          // Continue with other services
        }
      }

      this.initialized = true;
      logger.success("All services initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize services", { error: error.message });
      throw error;
    }
  }

  /**
   * Start background login for Homebridge service
   * @param {Object} serviceInstance - The Homebridge service instance
   */
  _startHomebridgeBackgroundLogin(serviceInstance) {
    (async () => {
      try {
        const ok = await serviceInstance.login();
        if (ok) {
          logger.service("homebridge", "Background login successful");
        } else {
          logger.warning(
            "Homebridge background login failed or returned non-OK"
          );
        }
      } catch (e) {
        logger.warning("Homebridge background login error", {
          error: e && e.message ? e.message : e,
        });
      }
    })();
  }

  getService(serviceName) {
    return this.services.get(serviceName);
  }

  async getServiceHealth(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      return {
        status: "offline",
        error: `Service '${serviceName}' not found`,
        timestamp: new Date().toISOString(),
      };
    }

    // Get or create circuit breaker for this service
    const breaker = circuitBreakerManager.getOrCreate(serviceName, {
      timeout: 5000,
      failureThreshold: 5,
      resetTimeout: 30000,
    });

    try {
      return await breaker.execute(() => service.checkHealth());
    } catch (error) {
      // If circuit is open, return cached state or offline
      if (breaker.state === "open") {
        logger.warn(`Circuit breaker open for service: ${serviceName}`, {
          serviceName,
          lastFailure: breaker.lastFailureTime,
        });
        return {
          status: "offline",
          error: `Service temporarily unavailable (circuit open)`,
          timestamp: new Date().toISOString(),
          circuitOpen: true,
        };
      }
      return {
        status: "offline",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getServiceStats(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    return await service.getStats();
  }

  async getTorManagerHealth() {
    if (!this.torManager) {
      return {
        status: "offline",
        error: "Tor manager not initialized",
        timestamp: new Date().toISOString(),
      };
    }

    return await this.torManager.checkHealth();
  }

  getAllServices() {
    return Array.from(this.services.keys());
  }

  getServiceInstances(serviceType) {
    return this.serviceInstances.get(serviceType) || [];
  }

  getServiceTypes() {
    return Array.from(this.serviceInstances.keys());
  }

  isInitialized() {
    return this.initialized;
  }

  async cleanup() {
    logger.progress("Cleaning up services");

    if (this.torManager) {
      await this.torManager.cleanup();
    }

    this.services.clear();
    this.initialized = false;
    logger.success("Service cleanup complete");
  }

  async shutdown() {
    logger.progress("Shutting down ServiceManager");
    await this.cleanup();
    logger.success("ServiceManager shutdown complete");
  }
}
