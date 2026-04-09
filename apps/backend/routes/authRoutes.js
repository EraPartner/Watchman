import { getErrorMessage } from "./routeUtils.js";

export function registerAuthRoutes(
  app,
  {
    authLimiter,
    checkLockout,
    requireFields,
    authenticateCredentials,
    recordFailedLogin,
    resetLoginAttempts,
    signToken,
    issueCsrfToken,
    requireAuth,
    extractAuthToken,
    verifyToken,
    FRONTEND_URL,
    COOKIE_OPTIONS,
    logger,
  }
) {
  app.post(
    "/api/auth/login",
    authLimiter,
    checkLockout,
    requireFields(["username", "password"]),
    async (req, res) => {
      const { username, password } = req.body;
      const ip = req.ip;

      try {
        const user = await authenticateCredentials(username, password);

        if (!user) {
          await recordFailedLogin(username, ip);
          return res.status(401).json({ message: "Invalid credentials" });
        }

        await resetLoginAttempts(username, ip);

        const accessToken = signToken({ sub: user.id }, "access");

        const isLocalhost =
          FRONTEND_URL?.includes("localhost") ||
          FRONTEND_URL?.includes("127.0.0.1");
        res.cookie("token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production" && !isLocalhost,
          sameSite: isLocalhost ? "lax" : "strict",
          maxAge: 8 * 60 * 60 * 1000,
        });

        issueCsrfToken(res);

        return res.status(200).json({
          message: "Login successful",
          token: accessToken,
          user: { username: user.username, id: user.id },
        });
      } catch (error) {
        const message = getErrorMessage(error);
        logger.error("Login error", { error: message });
        return res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    res.clearCookie("token", Object.assign({}, COOKIE_OPTIONS));
    res.clearCookie(process.env.CSRF_COOKIE_NAME || "csrfToken", { path: "/" });
    return res.json({ success: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const token = extractAuthToken(req);
    if (!token) return res.status(200).json({ authenticated: false });

    const decoded = verifyToken(token);
    if (!decoded) return res.status(200).json({ authenticated: false });

    issueCsrfToken(res);
    return res.json({
      authenticated: true,
      user: { username: decoded.username },
    });
  });
}
