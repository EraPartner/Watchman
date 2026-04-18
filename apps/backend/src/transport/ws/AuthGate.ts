import type { AuthUser, WsUpgradeRequest } from './types.js';

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
  allowedOrigins: ReadonlySet<string>;
  normalizeOrigin: (origin: string | undefined) => string | null;
}

export class AuthGate {
  private readonly enforceOrigin: boolean;

  constructor(private readonly deps: AuthGateDeps) {
    this.enforceOrigin = deps.allowedOrigins.size > 0;
  }

  isOriginAllowed(req: WsUpgradeRequest): boolean {
    if (!this.enforceOrigin) return true;
    const raw = req.headers['origin'];
    const str = Array.isArray(raw) ? raw[0] : raw;
    const normalized = this.deps.normalizeOrigin(str);
    return normalized !== null && this.deps.allowedOrigins.has(normalized);
  }

  authenticate(req: WsUpgradeRequest): AuthResult {
    const token = this.deps.extractToken(req);
    if (!token) return { ok: false, reason: 'No authentication token provided' };
    const decoded = this.deps.verifyToken(token);
    if (!decoded) return { ok: false, reason: 'Invalid or expired token' };
    const user: AuthUser = { username: decoded.username };
    const id = decoded.sub ?? decoded.id;
    if (id) user.id = id;
    return { ok: true, user };
  }
}
