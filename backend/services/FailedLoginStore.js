// ...existing code...
// Simple in-memory failed login tracker. Replace with persistent store in production.
class FailedLoginStore {
  constructor() {
    // key -> { attempts, lockedUntil }
    // key can be username or ip or username:ip
    this.store = new Map();
    this.maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5", 10);
    this.lockoutMs = parseInt(
      process.env.LOGIN_LOCKOUT_MS || String(15 * 60 * 1000),
      10
    ); // default 15 minutes
  }

  _key(username, ip) {
    return `${username || "anon"}:${ip || "unknown"}`;
  }

  recordFailure(username, ip) {
    const k = this._key(username, ip);
    const entry = this.store.get(k) || { attempts: 0, lockedUntil: 0 };
    entry.attempts = (entry.attempts || 0) + 1;
    if (entry.attempts >= this.maxAttempts) {
      entry.lockedUntil = Date.now() + this.lockoutMs;
    }
    this.store.set(k, entry);
    return entry;
  }

  clearAttempts(username, ip) {
    const k = this._key(username, ip);
    this.store.delete(k);
  }

  isLocked(username, ip) {
    const k = this._key(username, ip);
    const entry = this.store.get(k);
    if (!entry) return false;
    if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
    if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
      // lockout expired, reset
      this.store.delete(k);
      return false;
    }
    return false;
  }
}

export default new FailedLoginStore();
