import type { ReactNode } from "react";
import type { ServiceHealth } from "@/types/api";
import type { ServiceInstance } from "@/hooks/useServiceInstances";

export type ServiceKind =
  | "bitcoin"
  | "synology"
  | "adguard"
  | "tor"
  | "qbittorrent"
  | "ipfs"
  | "homebridge"
  | "albyhub"
  | "roon"
  | "philips"
  | "macmini"
  | "raspi"
  | "router"
  | "beryl"
  | "telenet"
  | "nostrcheck";

export type Tone = "neutral" | "ok" | "warn" | "crit";

export type MetricFormatter = (value: unknown) => string;

export interface MetricSpec {
  /** Dot-path into stats (e.g. `mempool.bytes`). */
  key: string;
  label: string;
  format: MetricFormatter;
  unit?: string;
  hint?: string;
}

export interface MetricGroup {
  title: string;
  metrics: MetricSpec[];
}

export type ChartKind = "area" | "line" | "bar" | "sparkline";

export interface ChartSpec {
  metric: string;
  label: string;
  kind: ChartKind;
  format: MetricFormatter;
  yDomain?: [number, number];
}

export interface RendererContext<S = Record<string, unknown>> {
  stats: S | undefined;
  health: ServiceHealth | undefined;
  instance?: ServiceInstance | undefined;
}

export interface ServiceRenderer<S = Record<string, unknown>> {
  kind: ServiceKind;
  displayName: string;
  /** Quick-link URL builder for the native service UI. */
  quickLink?: (instance: ServiceInstance | undefined) => string | undefined;
  /** Tile summary metrics (max 3). */
  summary: MetricSpec[];
  /** Detail sheet metric groups. */
  detail: MetricGroup[];
  /** Chart specs (used in Phase 5). */
  charts: ChartSpec[];
  /** Derived tone from current snapshot. */
  tone: (ctx: RendererContext<S>) => Tone;
  /** Optional custom subtitle rendered under the metric. */
  subtitle?: (ctx: RendererContext<S>) => ReactNode;
}
