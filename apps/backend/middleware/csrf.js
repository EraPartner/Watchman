// ...existing code...
import crypto from "crypto";

const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "csrfToken";
const CSRF_HEADER_NAME = process.env.CSRF_HEADER_NAME || "x-csrf-token";

export function issueCsrfToken(res) {
  const token = crypto.randomBytes(32).toString("hex");
  const cookieOpts = {
    httpOnly: false, // must be accessible to JS for double-submit
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    // keep token accessible to subpaths
    path: "/",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  };
  res.cookie(CSRF_COOKIE_NAME, token, cookieOpts);
  return token;
}

export function verifyCsrf(req, res, next) {
  // Only enforce for state-changing methods
  const method = (req.method || "").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();

  const headerToken =
    req.headers[CSRF_HEADER_NAME] ||
    req.headers[CSRF_HEADER_NAME.toLowerCase()];
  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE_NAME];

  if (!tokensMatch(headerToken, cookieToken)) {
    return res.status(403).json({ error: "Invalid or missing CSRF token" });
  }

  next();
}

function tokensMatch(headerToken, cookieToken) {
  if (!headerToken || !cookieToken) {
    return false;
  }

  const headerBuffer = Buffer.from(String(headerToken));
  const cookieBuffer = Buffer.from(String(cookieToken));

  if (headerBuffer.length !== cookieBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(headerBuffer, cookieBuffer);
}
