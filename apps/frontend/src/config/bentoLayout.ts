import type { ServiceKind } from "@/services/renderers/types";
import type { TileSize } from "@/components/tile/tileVariants";

export interface LayoutEntry {
  kind: ServiceKind;
  size: TileSize;
}

/**
 * Data-driven bento layout. Size tiers:
 * - XL: hero infra (Bitcoin full node)
 * - L:  infra-critical (Synology, Router)
 * - M:  default
 * - S:  status-only (Philips, Roon)
 *
 * During phase 3 only Bitcoin + Synology are wired; other entries are
 * placeholders that will activate when their renderer ships.
 */
export const BENTO_LAYOUT: ReadonlyArray<LayoutEntry> = [
  { kind: "bitcoin", size: "XL" },
  { kind: "synology", size: "L" },
  { kind: "router", size: "L" },
  { kind: "adguard", size: "M" },
  { kind: "qbittorrent", size: "M" },
  { kind: "ipfs", size: "M" },
  { kind: "tor", size: "M" },
  { kind: "homebridge", size: "M" },
  { kind: "macmini", size: "M" },
  { kind: "raspi", size: "M" },
  { kind: "albyhub", size: "S" },
  { kind: "philips", size: "S" },
  { kind: "roon", size: "S" },
  { kind: "nostrcheck", size: "S" },
];
