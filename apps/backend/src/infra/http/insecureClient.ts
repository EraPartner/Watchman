import { Agent } from "undici";
import { createHttpClient } from "./client.js";
import type { HttpClient } from "./client.js";

/**
 * HttpClient that does NOT verify the peer's TLS certificate
 * (`rejectUnauthorized: false`). Opt-in only — wired in for service instances
 * that explicitly set `allowSelfSigned`, e.g. a Homebridge Config UI X server
 * presenting a self-signed cert on the LAN. Safe under the single-user
 * trusted-network model (ADR-017/ADR-025); never use as the default client.
 *
 * Unlike createPinnedClient, identity is NOT established here — there is no
 * pin. Use only where the operator has accepted that the connection is
 * unauthenticated at the transport layer.
 */
export function createInsecureHttpClient(): HttpClient {
  return createHttpClient({
    dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
  });
}
