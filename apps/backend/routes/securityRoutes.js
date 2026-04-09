function notImplementedSecurityHandler(req, res) {
  return res.status(501).json({
    error: "Security monitoring not implemented",
    message:
      "This endpoint requires security monitoring middleware to be configured",
  });
}

export function registerSecurityRoutes(
  app,
  { requireAuth, requireWhitelistedIP }
) {
  app.get(
    "/api/security/alerts",
    requireAuth,
    requireWhitelistedIP,
    notImplementedSecurityHandler
  );

  app.get(
    "/api/security/stats",
    requireAuth,
    requireWhitelistedIP,
    notImplementedSecurityHandler
  );
}
