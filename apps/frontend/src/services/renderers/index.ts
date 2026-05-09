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

export const RENDERERS: Partial<Record<ServiceKind, ServiceRenderer>> = {
  adguard: adguardRenderer as unknown as ServiceRenderer,
  albyhub: albyHubRenderer as unknown as ServiceRenderer,
  bitcoin: bitcoinRenderer as unknown as ServiceRenderer,
  homebridge: homebridgeRenderer as unknown as ServiceRenderer,
  ipfs: ipfsRenderer as unknown as ServiceRenderer,
  macmini: macMiniRenderer as unknown as ServiceRenderer,
  philips: philipsBridgeRenderer as unknown as ServiceRenderer,
  qbittorrent: qbittorrentRenderer as unknown as ServiceRenderer,
  raspi: raspberryPiRenderer as unknown as ServiceRenderer,
  roon: roonRenderer as unknown as ServiceRenderer,
  router: routerRenderer as unknown as ServiceRenderer,
  synology: synologyRenderer as unknown as ServiceRenderer,
  tor: torRenderer as unknown as ServiceRenderer,
};

export const getRenderer = (
  kind: string
): ServiceRenderer | undefined => RENDERERS[kind as ServiceKind];

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
