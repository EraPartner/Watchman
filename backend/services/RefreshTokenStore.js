// ...existing code...
import crypto from 'crypto';

// Simple in-memory refresh token store. This should be replaced with a persistent store (Redis/DB) for production.
class RefreshTokenStore {
  constructor() {
    // token -> { username, expiresAt }
    this.tokens = new Map();
    // Optionally map username -> Set(tokens) to allow revoking all for a user
    this.userTokens = new Map();
    // Default TTL for refresh tokens (30 days)
    this.defaultTtlMs = (process.env.REFRESH_TOKEN_TTL_DAYS ? parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10) : 30) * 24 * 60 * 60 * 1000;
  }

  generateToken() {
    return crypto.randomBytes(48).toString('hex');
  }

  create(username) {
    const token = this.generateToken();
    const expiresAt = Date.now() + this.defaultTtlMs;
    this.tokens.set(token, { username, expiresAt });

    const set = this.userTokens.get(username) || new Set();
    set.add(token);
    this.userTokens.set(username, set);

    return { token, expiresAt };
  }

  rotate(oldToken) {
    const entry = this.tokens.get(oldToken);
    if (!entry) return null;

    const username = entry.username;
    // remove old
    this.revoke(oldToken);
    // create new
    return this.create(username);
  }

  get(token) {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      // expired
      this.revoke(token);
      return null;
    }
    return entry;
  }

  revoke(token) {
    const entry = this.tokens.get(token);
    if (!entry) return;
    const username = entry.username;
    this.tokens.delete(token);
    const set = this.userTokens.get(username);
    if (set) {
      set.delete(token);
      if (set.size === 0) this.userTokens.delete(username);
    }
  }

  revokeAllForUser(username) {
    const set = this.userTokens.get(username);
    if (!set) return;
    for (const t of set) {
      this.tokens.delete(t);
    }
    this.userTokens.delete(username);
  }
}

export default new RefreshTokenStore();
