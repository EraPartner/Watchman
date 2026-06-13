import type { ServiceKind } from "@/services/renderers/types";
import type { TileSize } from "@/components/tile/tileVariants";

export interface LayoutEntry {
  kind: ServiceKind;
  size: TileSize;
}

/**
 * Data-driven bento layout. Size tiers scale with how much each card shows:
 * - XL: hero infra (Bitcoin full node)
 * - L:  metric-rich (Synology)
 * - M:  default
 * - S:  status-only (Router, Philips, Roon — reachability + a couple of fields)
 */
export const BENTO_LAYOUT: ReadonlyArray<LayoutEntry> = [
  { kind: "bitcoin", size: "XL" },
  { kind: "synology", size: "L" },
  { kind: "router", size: "S" },
  { kind: "adguard", size: "M" },
  { kind: "qbittorrent", size: "M" },
  { kind: "ipfs", size: "M" },
  { kind: "tor", size: "M" },
  { kind: "homebridge", size: "M" },
  { kind: "macMini", size: "M" },
  { kind: "raspberryPi", size: "M" },
  { kind: "albyHub", size: "S" },
  { kind: "philipsBridge", size: "S" },
  { kind: "roon", size: "S" },
];
