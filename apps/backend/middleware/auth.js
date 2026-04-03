import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import logger from "./logger.js";

// Generate a constant dummy bcrypt hash at startup for timing-equalization
const DUMMY_HASH = bcrypt.hashSync("invalid", 10);

// Read env vars lazily (at call time) to ensure dotenv has loaded them first
function getJwtSecret() {
  return process.env.JWT_SECRET;
}
function getAuthUsername() {
  return process.env.AUTH_USERNAME;
}
function getAuthPasswordHash() {
  return process.env.AUTH_PASSWORD_HASH;
}

if (!getJwtSecret()) {
  logger.warn(
    "JWT_SECRET not set in environment. Auth will not function correctly."
  );
}

// Issue a signed JWT (short-lived access token)
export function signToken(payload, opts = {}) {
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET not configured");
  return jwt.sign(payload, secret, {
    expiresIn: opts.expiresIn || "15m",
    algorithm: "HS256",
  });
}

// Verify a token and return decoded payload or null
export function verifyToken(token) {
  const secret = getJwtSecret();
  if (!secret) return null;
  try {
    return jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch (err) {
    return null;
  }
}

// Authenticate credentials against env variables
export async function authenticateCredentials(username, password) {
  if (!username || !password) return null;
  if (typeof username !== "string" || typeof password !== "string") return null;
  if (username.length > 128 || password.length > 256) return null;

  const authUsername = getAuthUsername();
  const authPasswordHash = getAuthPasswordHash();

  // Always perform bcrypt compare to mitigate username enumeration via timing
  const hashToCompare = authPasswordHash || DUMMY_HASH;
  try {
    const passwordMatches = await bcrypt.compare(password, hashToCompare);
    const usernameMatches = authUsername && username === authUsername;
    if (usernameMatches && passwordMatches) {
      return {
        username: authUsername,
        id: authUsername,
      };
    }
    return null;
  } catch (err) {
    logger.error("Error comparing password hash", { error: err.message });
    return null;
  }
}

/**
 * Express middleware to require authentication
 *
 * Supports token in Authorization header (Bearer) or in HTTP-only cookie 'token'.
 * Implements proper token validation and user context attachment.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  // Extract token from Authorization header
  if (
    authHeader &&
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ")
  ) {
    const headerToken = authHeader.slice(7);
    if (headerToken.length > 0) {
      token = headerToken;
    }
  }

  // Fallback to cookie token if header token not found
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication token required",
    });
  }

  // Verify token and decode payload
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
  }

  // Attach user information to request for use in subsequent middleware
  req.user = {
    ...decoded,
    tokenIssuedAt: decoded.iat
      ? new Date(decoded.iat * 1000).toISOString()
      : null,
  };

  next();
}
