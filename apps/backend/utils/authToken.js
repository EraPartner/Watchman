/**
 * Authentication token extraction helpers shared by HTTP and WebSocket paths.
 */

const BEARER_PREFIX = "Bearer ";

export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return undefined;
  }

  if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
    return undefined;
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length);
  return token.length > 0 ? token : undefined;
}

export function parseCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [rawKey, ...rawValue] = entry.split("=");
        const key = String(rawKey || "").trim();
        const joinedValue = rawValue.join("=");

        if (!key) {
          return ["", ""];
        }

        try {
          return [key, decodeURIComponent(joinedValue)];
        } catch (_err) {
          return [key, joinedValue];
        }
      })
      .filter(([key]) => key.length > 0)
  );
}

/**
 * Extract token from Express or IncomingMessage-like request objects.
 *
 * Priority:
 * 1) Authorization: Bearer <token>
 * 2) Cookie token (req.cookies.token)
 * 3) Raw cookie header token
 */
export function extractAuthToken(req) {
  if (!req || typeof req !== "object") {
    return undefined;
  }

  const authHeader =
    req.headers && typeof req.headers === "object"
      ? req.headers.authorization
      : undefined;
  const bearerToken = extractBearerToken(authHeader);
  if (bearerToken) {
    return bearerToken;
  }

  if (
    req.cookies &&
    typeof req.cookies === "object" &&
    typeof req.cookies.token === "string" &&
    req.cookies.token.length > 0
  ) {
    return req.cookies.token;
  }

  const cookieHeader =
    req.headers && typeof req.headers === "object"
      ? req.headers.cookie
      : undefined;
  const parsedCookies = parseCookieHeader(cookieHeader);
  if (
    typeof parsedCookies.token === "string" &&
    parsedCookies.token.length > 0
  ) {
    return parsedCookies.token;
  }

  return undefined;
}
