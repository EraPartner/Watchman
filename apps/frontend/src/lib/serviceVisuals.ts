import {
  Activity,
  Bitcoin,
  HardDrive,
  ShieldCheck,
  Shield,
  Download,
  Boxes,
  Home,
  Zap,
  Music,
  Lightbulb,
  Cpu,
  CircuitBoard,
  Router as RouterIcon,
  type LucideIcon,
} from "lucide-react";
import type { ServiceKind } from "@/services/renderers/types";

/** Per-service glyph, used as a faint background watermark on tiles + the
 *  detail-sheet hero so every service reads at a glance. */
const KIND_ICON: Partial<Record<ServiceKind, LucideIcon>> = {
  bitcoin: Bitcoin,
  synology: HardDrive,
  adguard: ShieldCheck,
  tor: Shield,
  qbittorrent: Download,
  ipfs: Boxes,
  homebridge: Home,
  albyHub: Zap,
  roon: Music,
  philipsBridge: Lightbulb,
  macMini: Cpu,
  raspberryPi: CircuitBoard,
  router: RouterIcon,
};

export function serviceIcon(kind: ServiceKind | undefined): LucideIcon {
  return (kind && KIND_ICON[kind]) || Activity;
}

/** A formatted hero value that is a bare boolean reads better as a state
 *  chip (✓ Reachable) than as a giant "true"/"yes". */
const BOOL_HERO = /^(true|false|yes|no|on|off|up|down|online|offline)$/i;
const BOOL_TRUTHY = /^(true|yes|on|up|online)$/i;

export interface HeroState {
  isBool: boolean;
  truthy: boolean;
}

export function heroState(value: string | undefined): HeroState {
  const v = (value ?? "").trim();
  return { isBool: BOOL_HERO.test(v), truthy: BOOL_TRUTHY.test(v) };
}
