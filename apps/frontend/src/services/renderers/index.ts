import type { ServiceKind, ServiceRenderer } from "./types";
import { adguardRenderer } from "./adguard";
import { albyHubRenderer } from "./albyHub";
import { bitcoinRenderer } from "./bitcoin";
import { homebridgeRenderer } from "./homebridge";
import { ipfsRenderer } from "./ipfs";
import { macMiniRenderer } from "./macMini";
import { philipsBridgeRenderer } from "./philipsBridge";
import { qbittorrentRenderer } from "./qbittorrent";
import { raspberryPiRenderer } from "./raspberryPi";
import { roonRenderer } from "./roon";
import { routerRenderer } from "./router";
import { synologyRenderer } from "./synology";
import { torRenderer } from "./tor";

export type { ServiceKind, ServiceRenderer } from "./types";
export * from "./types";
export * from "./formatters";

// Exhaustively keyed by ServiceKind so a missing or misspelled kind is a
// compile error rather than a silently empty dashboard tile.
export const RENDERERS: Record<ServiceKind, ServiceRenderer> = {
  adguard: adguardRenderer,
  albyHub: albyHubRenderer,
  bitcoin: bitcoinRenderer,
  homebridge: homebridgeRenderer,
  ipfs: ipfsRenderer,
  macMini: macMiniRenderer,
  philipsBridge: philipsBridgeRenderer,
  qbittorrent: qbittorrentRenderer,
  raspberryPi: raspberryPiRenderer,
  roon: roonRenderer,
  router: routerRenderer,
  synology: synologyRenderer,
  tor: torRenderer,
};

export const getRenderer = (kind: string): ServiceRenderer | undefined =>
  RENDERERS[kind as ServiceKind];

/** Flatten every metric key surfaced by a renderer (summary + detail
 *  groups + charts), de-duplicated. Used by the tile + sheet to register
 *  series in the metric history ring buffer. */
export function rendererTrackedMetrics(
  renderer: ServiceRenderer | undefined
): ReadonlyArray<string> {
  if (!renderer) return [];
  const set = new Set<string>();
  for (const m of renderer.summary) set.add(m.key);
  for (const group of renderer.detail) {
    for (const m of group.metrics) set.add(m.key);
  }
  for (const c of renderer.charts) set.add(c.metric);
  return Array.from(set);
}
