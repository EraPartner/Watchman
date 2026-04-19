import { ToggleGroup, Toggle } from "@/components/primitives";
import type { HistoryRange } from "@/hooks/useServiceHistory";

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export interface RangePickerProps {
  value: HistoryRange;
  onChange: (next: HistoryRange) => void;
}

export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <ToggleGroup aria-label="Time range">
      {RANGES.map((r) => (
        <Toggle
          key={r.value}
          pressed={value === r.value}
          onPressedChange={(pressed) => {
            if (pressed) onChange(r.value);
          }}
          aria-label={`Last ${r.label}`}
        >
          {r.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
