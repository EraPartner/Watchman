import type { TestConnectionResult } from "@/services/configApi";

export interface ConnectionTestOutcome {
  ok: boolean;
  latencyMs: number;
  /** Why the test failed; undefined on success. */
  error?: string;
}

/**
 * Read a `POST /config/services/:id/test` result.
 *
 * `ok` only says the health check ran. Health checks report an unreachable
 * service as a resolved snapshot with `reachable: false` (the host-ping
 * wrapper never rejects), so `ok: true` alone showed "OK" for a service that
 * couldn't be reached.
 */
export function readConnectionTest(
  res: TestConnectionResult
): ConnectionTestOutcome {
  if (!res.ok) {
    return {
      ok: false,
      latencyMs: res.latencyMs,
      error: res.error?.message ?? "unknown",
    };
  }
  const snapshot = res.snapshot as
    | { reachable?: unknown; message?: unknown }
    | undefined;
  if (snapshot && snapshot.reachable === false) {
    return {
      ok: false,
      latencyMs: res.latencyMs,
      error:
        typeof snapshot.message === "string" && snapshot.message
          ? snapshot.message
          : "service unreachable",
    };
  }
  return { ok: true, latencyMs: res.latencyMs };
}
