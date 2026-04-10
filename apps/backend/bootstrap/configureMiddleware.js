import express from "express";
import compression from "compression";

export function configureMiddleware(
  app,
  {
    requestIdMiddleware,
    requestLogger,
    performanceMonitor,
    enforceIPControl,
    requestTimeout,
    responseSizeLimit,
    apiResponseStandardizer,
    frontendDist,
    logger,
    helmet,
    FRONTEND_URL,
    cors,
    normalizeOrigin,
    ALLOWED_CORS_ORIGINS,
    cookieParser,
    swaggerUi,
    YAML,
    fs,
    join,
    __esmdirname,
    generalLimiter,
  }
) {
  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use(performanceMonitor.trackRequest());
  app.use(enforceIPControl);
  app.use(requestTimeout);
  app.use(responseSizeLimit);
  app.use(
    apiResponseStandardizer({
      autoWrap: true,
    })
  );

  if (process.env.NODE_ENV === "production" && fs.existsSync(frontendDist)) {
    logger.info(`Serving frontend from ${frontendDist}`);
    app.use(express.static(frontendDist, { maxAge: "1d" }));
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", ...(FRONTEND_URL ? [FRONTEND_URL] : [])],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
      frameguard: { action: "deny" },
      permittedCrossDomainPolicies: { permittedPolicies: "none" },
    })
  );

  app.use((req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
    );

    res.setHeader("X-Request-ID", req.requestId || req.id || "unknown");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.removeHeader("X-Powered-By");

    next();
  });

  app.use(compression({ level: 6, threshold: 1024 }));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (!FRONTEND_URL || FRONTEND_URL === "*") {
          if (process.env.NODE_ENV === "production") {
            return callback(
              new Error("CORS: FRONTEND_URL not configured in production")
            );
          }
          return callback(null, true);
        }

        const normalizedOrigin = normalizeOrigin(origin);
        if (!normalizedOrigin) {
          return callback(new Error("CORS: Invalid origin format"));
        }

        if (!ALLOWED_CORS_ORIGINS.has(normalizedOrigin)) {
          if (process.env.NODE_ENV === "production") {
            return callback(
              new Error(`CORS: Origin ${normalizedOrigin} not allowed`)
            );
          }
          return callback(null, true);
        }

        return callback(null, true);
      },
      credentials: true,
      maxAge: 86400,
    })
  );

  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  try {
    const swaggerDocument = YAML.load(
      fs.readFileSync(join(__esmdirname, "api-docs.yaml"), "utf8")
    );

    if (swaggerUi && swaggerUi.serve && swaggerUi.setup) {
      app.use(
        "/api/docs",
        swaggerUi.serve,
        swaggerUi.setup(swaggerDocument, { explorer: true })
      );
    }
  } catch (err) {
    logger.warning("Swagger UI not available", { error: err.message });
  }

  app.use("/api/", generalLimiter);
}
