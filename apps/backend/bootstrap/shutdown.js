export function attachShutdownHandlers({ logger, handleGracefulShutdown }) {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception - Critical Error", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    if (process.env.NODE_ENV === "production") {
      handleGracefulShutdown("uncaughtException");
    } else {
      logger.error("Uncaught Exception - Critical Error", {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    }
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Promise Rejection", {
      reason: reason?.toString() || "Unknown reason",
      promise: promise.toString(),
      timestamp: new Date().toISOString(),
    });

    if (process.env.NODE_ENV === "production") {
      handleGracefulShutdown("unhandledRejection");
    } else {
      logger.error("Unhandled Promise Rejection - Critical Error", {
        reason: reason?.toString() || "Unknown reason",
      });
      process.exit(1);
    }
  });

  process.on("SIGINT", () => {
    logger.info("Received SIGINT signal, initiating graceful shutdown");
    handleGracefulShutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM signal, initiating graceful shutdown");
    handleGracefulShutdown("SIGTERM");
  });
}

export async function performGracefulShutdown(
  signal,
  {
    logger,
    httpServerInstance,
    WebSocketManager,
    serviceManager,
    destroyAgents,
    performanceMonitor,
  }
) {
  logger.progress(`Received ${signal || "shutdown"}, shutting down gracefully`);

  try {
    if (httpServerInstance) {
      logger.progress("Closing HTTP server to new connections");
      await new Promise((resolve, reject) => {
        httpServerInstance.close((err) => (err ? reject(err) : resolve()));
        setTimeout(resolve, 10000);
      });
    }
  } catch (err) {
    logger.warning(
      `Error closing HTTP server: ${err && err.message ? err.message : err}`
    );
  }

  try {
    WebSocketManager.shutdown();
  } catch (err) {
    logger.warning(
      `Error shutting down WebSocket manager: ${err && err.message ? err.message : err}`
    );
  }

  try {
    if (serviceManager && typeof serviceManager.shutdown === "function") {
      await serviceManager.shutdown();
    }
  } catch (err) {
    logger.warning(
      `Error shutting down service manager: ${err && err.message ? err.message : err}`
    );
  }

  try {
    destroyAgents();
  } catch (_err) {
    // ignore
  }

  try {
    if (
      performanceMonitor &&
      typeof performanceMonitor.shutdown === "function"
    ) {
      performanceMonitor.shutdown();
      logger.success("Performance monitor shutdown complete");
    }
  } catch (_err) {
    // ignore
  }

  logger.success("Shutdown complete, exiting");
  process.exit(0);
}
