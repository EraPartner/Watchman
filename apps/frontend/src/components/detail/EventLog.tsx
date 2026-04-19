import { ScrollArea } from "@/components/primitives";

export interface ServiceEvent {
  id: string;
  ts: number;
  serviceKey: string;
  level: "error" | "warn" | "info";
  message: string;
}

export interface EventLogProps {
  events: ReadonlyArray<ServiceEvent>;
  emptyLabel?: string;
  maxHeight?: number;
}

function fmtTs(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return "";
  }
}

const LEVEL_TONE: Record<ServiceEvent["level"], string> = {
  error: "var(--crit)",
  warn: "var(--warn)",
  info: "var(--text-md)",
};

export function EventLog({
  events,
  emptyLabel = "No recent events.",
  maxHeight = 240,
}: EventLogProps) {
  if (events.length === 0) {
    return (
      <p className="text-fs-label text-[var(--text-lo)]">{emptyLabel}</p>
    );
  }

  return (
    <ScrollArea style={{ maxHeight }}>
      <ul className="space-y-s-2">
        {events.map((ev) => (
          <li
            key={ev.id}
            className="flex items-baseline gap-s-3 border-b border-[var(--hairline)] pb-s-2 last:border-b-0"
          >
            <span className="shrink-0 font-mono tabular-nums text-fs-label text-[var(--text-lo)]">
              {fmtTs(ev.ts)}
            </span>
            <span
              className="shrink-0 font-mono text-fs-label uppercase"
              style={{ color: LEVEL_TONE[ev.level] }}
            >
              {ev.level}
            </span>
            <span className="min-w-0 flex-1 truncate text-fs-body text-[var(--text-hi)]">
              {ev.message}
            </span>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
