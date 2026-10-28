import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { dotGet, fmtNumber, fmtRaw, fmtTempC, fmtUptime, fmtVolt } from "./formatters";

type Stats = Record<string, unknown>;

function fmtThrottled(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return v === 0 ? "OK" : `0x${v.toString(16).toUpperCase()}`;
  }
  return String(v);
}

// vcgencmd get_throttled: bits 0-3 are the current state, bits 16-19 record
// that the same condition happened since boot and stay set until reboot.
const THROTTLED_NOW_MASK = 0xf;

/** Current throttling bits; prefers the backend's split `throttledNow`. */
export function currentThrottled(stats: Stats | undefined): number | undefined {
  if (!stats) return undefined;
  const now = dotGet(stats, "throttledNow");
  if (typeof now === "number") return now;
  const raw = dotGet(stats, "throttled");
  return typeof raw === "number" ? raw & THROTTLED_NOW_MASK : undefined;
}

export const raspberryPiRenderer: ServiceRenderer<Stats> = {
  kind: "raspberryPi",
  displayName: "Raspberry Pi",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["host", "address"],
      portKeys: ["port"],
    }),
  quickLinkLabel: "Open host",

  summary: [
    { key: "cpuTemp", label: "Temp", format: fmtTempC },
    { key: "clockRate", label: "Clock", format: fmtNumber(0) },
    { key: "uptime", label: "Uptime", format: fmtUptime },
  ],

  detail: [
    {
      title: "CPU",
      metrics: [
        { key: "cpuTemp", label: "Temperature", format: fmtTempC },
        { key: "clockRate", label: "Clock rate", format: fmtNumber(0) },
        { key: "voltage", label: "Core voltage", format: fmtVolt },
        { key: "throttled", label: "Throttle status", format: fmtThrottled },
        { key: "load", label: "Load avg (1m)", format: fmtNumber(2) },
      ],
    },
    {
      title: "Memory",
      metrics: [
        { key: "memory", label: "Total RAM", format: fmtRaw },
      ],
    },
    {
      title: "Host",
      metrics: [
        { key: "piModel", label: "Model", format: fmtRaw },
        { key: "prettyName", label: "OS", format: fmtRaw },
        { key: "processor", label: "Processor", format: fmtRaw },
        { key: "isRpi", label: "Is Raspberry Pi", format: fmtRaw },
        { key: "pigpioVersion", label: "pigpio", format: fmtRaw },
        { key: "rpiCliAvailable", label: "rpi-cli", format: fmtRaw },
        { key: "rpiCliError", label: "rpi-cli error", format: fmtRaw },
        { key: "uptime", label: "Uptime", format: fmtUptime },
      ],
    },
  ],

  charts: [
    { metric: "cpuTemp", label: "CPU temp", kind: "line", format: fmtTempC },
    { metric: "clockRate", label: "Clock rate", kind: "line", format: fmtNumber(0) },
    { metric: "voltage", label: "Core voltage", kind: "line", format: fmtVolt },
    { metric: "load", label: "Load avg", kind: "line", format: fmtNumber(2) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    // Only current throttling warns: the since-boot bits stay set after a
    // single brown-out, which kept the tile amber until the next reboot.
    const throttled = currentThrottled(stats);
    if (throttled !== undefined && throttled !== 0) return "warn";
    const temp = stats ? dotGet(stats, "cpuTemp") : undefined;
    if (typeof temp === "number") {
      if (temp >= 80) return "crit";
      if (temp >= 70) return "warn";
    }
    return "ok";
  },
};
