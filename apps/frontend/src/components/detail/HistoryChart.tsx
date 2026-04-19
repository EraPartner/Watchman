import { useId, useMemo } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { AreaClosed, LinePath, Bar } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { scaleLinear, scaleTime } from "@visx/scale";
import { curveMonotoneX } from "@visx/curve";
import { extent } from "d3-array";
import { useServiceHistory, type HistoryRange } from "@/hooks/useServiceHistory";
import type { ChartSpec, Tone } from "@/services/renderers/types";
import type { HistoryPoint } from "@/services/apiClient/types";

const TONE_VAR: Record<Tone, string> = {
  neutral: "var(--text-md)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  crit: "var(--crit)",
};

export interface HistoryChartProps {
  kind: string;
  instance?: string;
  spec: ChartSpec;
  range: HistoryRange;
  tone?: Tone;
  height?: number;
}

interface InnerProps extends HistoryChartProps {
  width: number;
  height: number;
  points: HistoryPoint[];
  stroke: string;
}

function ChartInner({
  width,
  height,
  points,
  spec,
  stroke,
}: InnerProps) {
  const gradientId = useId();
  const margin = { top: 8, right: 8, bottom: 22, left: 44 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const series = useMemo(
    () => points.filter((p) => p.v != null && Number.isFinite(p.v)),
    [points]
  );

  const { xScale, yScale } = useMemo(() => {
    if (series.length === 0) {
      return { xScale: null, yScale: null };
    }
    const [tMin, tMax] = extent(series, (d) => d.t) as [number, number];
    const [vMin, vMax] = spec.yDomain ?? (extent(series, (d) => d.v as number) as [number, number]);
    const pad = vMax === vMin ? Math.abs(vMax) * 0.1 + 1 : (vMax - vMin) * 0.08;
    const xScale = scaleTime({
      domain: [new Date(tMin), new Date(tMax)],
      range: [0, innerW],
    });
    const yScale = scaleLinear<number>({
      domain: [vMin - pad, vMax + pad],
      range: [innerH, 0],
      nice: true,
    });
    return { xScale, yScale };
  }, [series, innerW, innerH, spec.yDomain]);

  if (!xScale || !yScale || series.length === 0) {
    return (
      <svg width={width} height={height} aria-label={spec.label} role="img">
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fill="var(--text-lo)"
          fontSize={11}
        >
          No data
        </text>
      </svg>
    );
  }

  const x = (d: HistoryPoint) => xScale(new Date(d.t)) ?? 0;
  const y = (d: HistoryPoint) => yScale(d.v as number) ?? 0;

  return (
    <svg width={width} height={height} aria-label={spec.label} role="img">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Group left={margin.left} top={margin.top}>
        <AxisLeft
          scale={yScale}
          numTicks={4}
          stroke="var(--hairline)"
          tickStroke="var(--hairline)"
          tickFormat={(v) => spec.format(Number(v))}
          tickLabelProps={() => ({
            fill: "var(--text-lo)",
            fontSize: 10,
            textAnchor: "end",
            dx: -4,
            dy: 3,
            fontFamily: "var(--font-mono)",
          })}
        />
        <AxisBottom
          top={innerH}
          scale={xScale}
          numTicks={Math.max(2, Math.floor(innerW / 80))}
          stroke="var(--hairline)"
          tickStroke="var(--hairline)"
          tickLabelProps={() => ({
            fill: "var(--text-lo)",
            fontSize: 10,
            textAnchor: "middle",
            fontFamily: "var(--font-mono)",
          })}
        />
        {spec.kind === "bar" ? (
          series.map((d, i) => {
            const barW = Math.max(1, innerW / series.length - 1);
            return (
              <Bar
                key={i}
                x={x(d) - barW / 2}
                y={y(d)}
                width={barW}
                height={innerH - y(d)}
                fill={stroke}
                opacity={0.8}
              />
            );
          })
        ) : (
          <>
            {spec.kind !== "line" && (
              <AreaClosed
                data={series}
                x={x}
                y={y}
                yScale={yScale}
                curve={curveMonotoneX}
                fill={`url(#${gradientId})`}
              />
            )}
            <LinePath
              data={series}
              x={x}
              y={y}
              curve={curveMonotoneX}
              stroke={stroke}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}
      </Group>
    </svg>
  );
}

export function HistoryChart({
  kind,
  instance,
  spec,
  range,
  tone = "neutral",
  height = 160,
}: HistoryChartProps) {
  const { data, isLoading, isError } = useServiceHistory(kind, {
    instance,
    metric: spec.metric,
    range,
  });

  const stroke = TONE_VAR[tone];
  const points = data?.points ?? [];

  if (isLoading && points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-fs-label text-[var(--text-lo)]"
        style={{ height }}
      >
        Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <div
        className="flex items-center justify-center text-fs-label text-[var(--crit)]"
        style={{ height }}
      >
        History unavailable
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ParentSize>
        {({ width, height: h }) =>
          width > 0 && h > 0 ? (
            <ChartInner
              kind={kind}
              instance={instance}
              spec={spec}
              range={range}
              tone={tone}
              width={width}
              height={h}
              points={points}
              stroke={stroke}
            />
          ) : null
        }
      </ParentSize>
    </div>
  );
}
