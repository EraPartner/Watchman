import {
  Bitcoin,
  Cpu,
  Download,
  Globe,
  HardDrive,
  Home,
  Lightbulb,
  Monitor,
  Music,
  Router,
  Server,
  Shield,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type KindCategory = "Network" | "Media" | "Bitcoin" | "Home" | "Hardware";

export interface KindMeta {
  category: KindCategory;
  icon: LucideIcon;
  blurb: string;
}

export const KIND_CATEGORIES: Record<string, KindMeta> = {
  router: { category: "Network", icon: Router, blurb: "Ping + port health" },
  adguard: { category: "Network", icon: Shield, blurb: "AdGuard DNS health" },
  tor: { category: "Network", icon: Globe, blurb: "Tor relay presence" },
  qbittorrent: {
    category: "Media",
    icon: Download,
    blurb: "Torrent client stats",
  },
  roon: { category: "Media", icon: Music, blurb: "Roon core health" },
  bitcoin: { category: "Bitcoin", icon: Bitcoin, blurb: "Bitcoin RPC node" },
  albyHub: { category: "Bitcoin", icon: Zap, blurb: "Alby Hub node" },
  ipfs: { category: "Home", icon: HardDrive, blurb: "IPFS node status" },
  philipsBridge: {
    category: "Home",
    icon: Lightbulb,
    blurb: "Hue bridge reachability",
  },
  homebridge: { category: "Home", icon: Home, blurb: "Homebridge status" },
  macMini: {
    category: "Hardware",
    icon: Monitor,
    blurb: "Mac Mini SSH probe",
  },
  synology: { category: "Hardware", icon: Server, blurb: "Synology SNMP" },
  raspberryPi: { category: "Hardware", icon: Cpu, blurb: "Pi + tunnel" },
};

export const CATEGORY_ORDER: readonly KindCategory[] = [
  "Network",
  "Media",
  "Bitcoin",
  "Home",
  "Hardware",
] as const;

const FALLBACK: KindMeta = {
  category: "Hardware",
  icon: Server,
  blurb: "",
};

export function getKindMeta(kind: string): KindMeta {
  return KIND_CATEGORIES[kind] ?? FALLBACK;
}
