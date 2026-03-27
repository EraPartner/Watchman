import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Load env (server already loads dotenv in server.js but this keeps the file standalone for tests)
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_USERNAME = process.env.AUTH_USERNAME;
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH; // bcrypt hash

// A constant dummy bcrypt hash for timing-equalization when username/hash is missing
const DUMMY_HASH =
  "$2a$10$CjwK8e1GQ8r9l1wqOe1LzeqYp6uGqv0qgX6Yc8Xf2sG1zQyZlK0lG"; // hash of 'invalid'

if (!JWT_SECRET) {
  console.warn(
    "⚠️ JWT_SECRET not set in environment. Auth will not function correctly."
  );
}

// Issue a signed JWT (short-lived access token)
export function signToken(payload, opts = {}) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: opts.expiresIn || "15m",
    algorithm: "HS256", // Explicitly specify algorithm to prevent algorithm confusion attacks
  });
}

// Verify a token and return decoded payload or null
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  } catch (err) {
    return null;
  }
}

// Authenticate credentials against env variables
export async function authenticateCredentials(username, password) {
  // Basic input checks to avoid abuse
  if (!username || !password) return null;
  if (typeof username !== "string" || typeof password !== "string") return null;
  if (username.length > 128 || password.length > 256) return null;

  // Always perform bcrypt compare to mitigate username enumeration via timing
  const hashToCompare = AUTH_PASSWORD_HASH || DUMMY_HASH;
  try {
    const passwordMatches = await bcrypt.compare(password, hashToCompare);
    // Only succeed if username matches configured username AND password matches real hash
    const usernameMatches = AUTH_USERNAME && username === AUTH_USERNAME;
    if (usernameMatches && passwordMatches) {
      // Return user object with username and id
      return {
        username: AUTH_USERNAME,
        id: AUTH_USERNAME, // Using username as ID since we only have one user
      };
    }
    return null;
  } catch (err) {
    console.error("Error comparing password hash", err);
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
