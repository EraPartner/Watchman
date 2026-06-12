import type { AuthUser, WsUpgradeRequest } from "./types.js";

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: string };

export interface TokenExtractor {
  (req: WsUpgradeRequest): string | null;
}

export interface TokenVerifier {
  (token: string): { username: string; sub?: string; id?: string } | null;
}

export interface AuthGateDeps {
  extractToken: TokenExtractor;
  verifyToken: TokenVerifier;
  isOriginAllowed: (origin: string | undefined) => boolean;
  requireToken?: boolean;
}

export class AuthGate {
  constructor(private readonly deps: AuthGateDeps) {}

  isOriginAllowed(req: WsUpgradeRequest): boolean {
    const raw = req.headers["origin"];
    const str = Array.isArray(raw) ? raw[0] : raw;
    return this.deps.isOriginAllowed(str);
  }

  authenticate(req: WsUpgradeRequest): AuthResult {
    const token = this.deps.extractToken(req);
    if (!token) {
      if (this.deps.requireToken) {
        return { ok: false, reason: "No authentication token provided" };
      }
      return { ok: true, user: { username: "anonymous" } };
    }
    const decoded = this.deps.verifyToken(token);
    if (!decoded) return { ok: false, reason: "Invalid or expired token" };
    const user: AuthUser = { username: decoded.username };
    const id = decoded.sub ?? decoded.id;
    if (id) user.id = id;
    return { ok: true, user };
  }
}
