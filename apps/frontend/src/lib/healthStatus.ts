import type { HealthSnapshot } from "@/services/apiClient/types";

export type HealthStatus = "online" | "offline" | "warning";

/**
 * Collapse a health snapshot to the status the tiles, the detail sheet and the
 * TopNav summary share. A service that is reachable overall but has a down host
 * or service tier (e.g. a NAS that blocks ICMP but answers SNMP) is "warning",
 * not "online".
 */
export function healthStatus(
  snap: Pick<HealthSnapshot, "reachable" | "host" | "service">
): HealthStatus {
  if (!snap.reachable) return "offline";
  const hostDown = snap.host?.reachable === false;
  const serviceDown = snap.service?.reachable === false;
  return hostDown || serviceDown ? "warning" : "online";
}
