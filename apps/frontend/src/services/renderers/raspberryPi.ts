import type { ServiceRenderer } from "./types";
import { dotGet, fmtNumber, fmtRaw, fmtTempC, fmtUptime } from "./formatters";

type Stats = Record<string, unknown>;

export const raspberryPiRenderer: ServiceRenderer<Stats> = {
  kind: "raspi",
  displayName: "Raspberry Pi",

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
      ],
    },
    {
      title: "Host",
      metrics: [
        { key: "piModel", label: "Model", format: fmtRaw },
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
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    const temp = stats ? dotGet(stats, "cpuTemp") : undefined;
    if (typeof temp === "number") {
      if (temp >= 80) return "crit";
      if (temp >= 70) return "warn";
    }
    return "ok";
  },
};
