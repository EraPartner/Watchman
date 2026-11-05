import { UnauthorizedError } from "../../core/errors.js";

/**
 * Stops a service from repeating credentials the device already refused.
 *
 * Polling runs every few seconds, and devices count failed logins (qBittorrent
 * bans the IP, AdGuard blocks it for a while). After the first rejection the
 * gate blocks requests for `backoffMs`; after `maxRejections` rejections in a
 * row it blocks them until the service is re-created, which happens when its
 * configuration is saved (or Watchman restarts). The user decided on
 * 2026-11-05: stop until the credentials are re-saved.
 */
export interface AuthGate {
  /** Throws the remembered rejection while requests are blocked. */
  check(): void;
  /** Record a rejected credential. Rejections that arrive while the gate is
   *  already blocking (parallel requests sent before the first answer) do
   *  not count again. */
  reject(error: UnauthorizedError): void;
  /** Record an accepted credential; clears the rejection count. */
  accept(): void;
  /** True once requests stay blocked until the configuration is saved. */
  readonly stopped: boolean;
}

export interface AuthGateOptions {
  now: () => number;
  /** Block after the first rejection (default 5 min). */
  backoffMs?: number;
  /** Rejections in a row before stopping for good (default 2). */
  maxRejections?: number;
  /** Service label for the error message, e.g. "qbittorrent". */
  label: string;
}

export const AUTH_BACKOFF_MS = 5 * 60 * 1000;
export const AUTH_MAX_REJECTIONS = 2;

export function createAuthGate(opts: AuthGateOptions): AuthGate {
  const backoffMs = opts.backoffMs ?? AUTH_BACKOFF_MS;
  const maxRejections = Math.max(1, opts.maxRejections ?? AUTH_MAX_REJECTIONS);
  let rejections = 0;
  let blockedUntil = 0;
  let stopped = false;
  let last: UnauthorizedError | undefined;

  const blocking = (): boolean => stopped || opts.now() < blockedUntil;

  return {
    check(): void {
      if (last && blocking()) throw last;
    },
    reject(error: UnauthorizedError): void {
      if (blocking()) return;
      rejections++;
      if (rejections >= maxRejections) {
        stopped = true;
        last = new UnauthorizedError(
          `${opts.label}: credentials rejected ${rejections} times, so ` +
            `Watchman stopped trying. Fix and save the credentials to retry. ` +
            `Last error: ${error.message}`
        );
      } else {
        blockedUntil = opts.now() + backoffMs;
        last = error;
      }
    },
    accept(): void {
      rejections = 0;
      blockedUntil = 0;
      last = undefined;
    },
    get stopped(): boolean {
      return stopped;
    },
  };
}
