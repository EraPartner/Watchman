export function registerRoutes(
  app,
  {
    healthLimiter,
    APP_VERSION,
    registerApiRoutes,
    apiRouteDeps,
    logger,
    frontendDist,
    fs,
    join,
  }
) {
  registerApiRoutes(app, apiRouteDeps);

  app.get("/health", healthLimiter, (req, res) => {
    res.locals.skipStandardization = true;
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "watchman-backend",
      version: APP_VERSION,
    });
  });

  app.use((req, res, next) => {
    res.status(404).json({ error: "Not Found" });
  });

  app.use((err, req, res, next) => {
    logger.error("Unhandled error", {
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    });
    const status = err.status || 500;
    if (status >= 500) {
      return res.status(status).json({ error: "Internal Server Error" });
    }
    return res.status(status).json({ error: err.message || "Request failed" });
  });

  if (process.env.NODE_ENV === "production" && fs.existsSync(frontendDist)) {
    app.get("*", (req, res) => {
      res.sendFile(join(frontendDist, "index.html"));
    });
  }
}
