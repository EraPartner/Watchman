import { getErrorMessage } from "./routeUtils.js";
import { getRequestIp } from "../utils/ip.js";

function buildLoginResponse(user, accessToken, includeToken) {
  const response = {
    message: "Login successful",
    user: { username: user.username, id: user.id },
  };

  if (includeToken) {
    response.token = accessToken;
  }

  return response;
}

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
    COOKIE_OPTIONS,
    AUTH_RETURN_TOKEN = false,
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
      const ip = getRequestIp(req);

      try {
        const user = await authenticateCredentials(username, password);

        if (!user) {
          await recordFailedLogin(username, ip);
          return res.status(401).json({ message: "Invalid credentials" });
        }

        await resetLoginAttempts(username, ip);

        const accessToken = signToken(
          { sub: user.id, username: user.username },
          { expiresIn: "8h" }
        );

        res.cookie("token", accessToken, {
          ...COOKIE_OPTIONS,
          maxAge: 8 * 60 * 60 * 1000,
        });

        issueCsrfToken(res);

        return res
          .status(200)
          .json(buildLoginResponse(user, accessToken, AUTH_RETURN_TOKEN));
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

    const claims =
      typeof decoded === "object" && decoded !== null
        ? decoded
        : { sub: undefined, username: undefined };
    const id = claims.sub;
    const username =
      typeof claims.username === "string" && claims.username.length > 0
        ? claims.username
        : typeof id === "string"
          ? id
          : undefined;

    issueCsrfToken(res);
    return res.json({
      authenticated: true,
      user: { id, username },
    });
  });
}
