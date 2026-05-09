import { Sparkline, type SparklineTone } from "@/components/primitives/Sparkline";
import { useMetricSeries } from "@/lib/metricHistory";
import type { ChartSpec, Tone } from "@/services/renderers/types";

const TONE_TO_SPARK: Record<Tone, SparklineTone> = {
  neutral: "neutral",
  ok: "accent",
  warn: "warn",
  crit: "crit",
};

interface ChartCardProps {
  kind: string;
  instanceId: string | undefined;
  spec: ChartSpec;
  tone: Tone;
}

function ChartCard({ kind, instanceId, spec, tone }: ChartCardProps) {
  const series = useMetricSeries(kind, instanceId, spec.metric);
  const data = series.map((s) => s.v);
  const latest = data.length > 0 ? data[data.length - 1]! : undefined;

  return (
    <div className="rounded-r-2 border border-[var(--hairline)] bg-[var(--surface-1)] p-s-3">
      <div className="flex items-baseline justify-between gap-s-3">
        <div className="text-fs-label uppercase tracking-[0.06em] text-[var(--text-lo)]">
          {spec.label}
        </div>
        <div className="font-mono tabular-nums text-fs-body text-[var(--text-hi)]">
          {latest !== undefined ? spec.format(latest) : "—"}
        </div>
      </div>
      <div className="mt-s-2">
        <Sparkline
          data={data}
          width={420}
          height={spec.kind === "area" ? 64 : 56}
          fill={spec.kind === "area"}
          tone={TONE_TO_SPARK[tone]}
          className="w-full"
          preserveAspectRatio="none"
        />
      </div>
      <div className="mt-s-1 flex justify-between font-mono text-fs-label text-[var(--text-lo)]">
        <span>{data.length} sample{data.length === 1 ? "" : "s"}</span>
        <span>live</span>
      </div>
    </div>
  );
}

export interface ChartsPanelProps {
  kind: string;
  instanceId: string | undefined;
  charts: ReadonlyArray<ChartSpec>;
  tone: Tone;
}

export function ChartsPanel({
  kind,
  instanceId,
  charts,
  tone,
}: ChartsPanelProps) {
  if (charts.length === 0) {
    return (
      <p className="text-fs-label text-[var(--text-lo)]">
        No charts defined for this service.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-s-3 md:grid-cols-2">
      {charts.map((spec) => (
        <ChartCard
          key={spec.metric}
          kind={kind}
          instanceId={instanceId}
          spec={spec}
          tone={tone}
        />
      ))}
    </div>
  );
}
