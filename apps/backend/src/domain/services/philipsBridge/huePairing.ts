import type { HttpClient } from '../../../infra/http/client.js';
import { UnavailableError, ValidationError } from '../../../core/errors.js';

export interface HuePairingDeps {
  http: HttpClient;
  probeCertHash: (host: string, port: number, timeoutMs: number) => Promise<string>;
  /**
   * Client pinned to the probed cert. The bridge serves a self-signed cert
   * (Signify root, bridge-id CN), so a CA-verifying client can never pair.
   */
  httpForCert?: (certHash: string) => HttpClient;
}

export interface PairResult {
  applicationKey: string;
  certHash: string;
}

interface HuePairSuccess {
  success: { username: string; clientkey?: string };
}

interface HuePairError {
  error: { type: number; description: string };
}

type HuePairItem = HuePairSuccess | HuePairError;

const HUE_PAIR_URL = (host: string) => `https://${host}/api`;

const PAIR_BODY = JSON.stringify({ devicetype: 'watchman#host', generateclientkey: true });

/**
 * Pair with a Philips Hue Bridge by posting to its /api endpoint.
 * Probes the TLS cert SHA-256 fingerprint first, then pairs over a client
 * pinned to it (trust on first use, same pin the service then uses).
 * Returns the applicationKey and certHash on success.
 * Throws ValidationError when the link button has not been pressed.
 * Throws UnavailableError on connection or bridge errors.
 */
export async function pairBridge(
  host: string,
  deps: HuePairingDeps,
  timeoutMs = 10_000,
): Promise<PairResult> {
  const certHash = await deps.probeCertHash(host, 443, timeoutMs);
  const http = deps.httpForCert ? deps.httpForCert(certHash) : deps.http;
  const response = await http.send({
    url: HUE_PAIR_URL(host),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: PAIR_BODY,
    timeoutMs,
  });

  let items: HuePairItem[];
  try {
    items = await response.json<HuePairItem[]>();
  } catch {
    throw new UnavailableError('unexpected response from Hue bridge');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new UnavailableError('unexpected response from Hue bridge');
  }

  const item = items[0]!;

  if ('error' in item) {
    if (item.error.type === 101) {
      throw new ValidationError(
        'link button not pressed — press the physical button on the bridge, then try again',
      );
    }
    throw new UnavailableError(`bridge error ${item.error.type}: ${item.error.description}`);
  }

  if (!('success' in item) || !item.success.username) {
    throw new UnavailableError('unexpected bridge response format');
  }

  return { applicationKey: item.success.username, certHash };
}
