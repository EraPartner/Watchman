import { forwardRef, useId, useMemo, type SVGAttributes } from "react";
import { cn } from "@/lib/utils";

export type SparklineTone = "neutral" | "ok" | "warn" | "crit" | "accent";

export interface SparklineProps
  extends Omit<SVGAttributes<SVGSVGElement>, "children"> {
  /** Numeric series. Non-finite values are filtered. */
  data: ReadonlyArray<number>;
  width?: number;
  height?: number;
  /** Stroke + fill tone mapped to CSS vars. */
  tone?: SparklineTone;
  /** Render filled area under the line. */
  fill?: boolean;
  /** Optional accessible label; if omitted, chart is treated as decorative. */
  label?: string;
  /** Optional baseline value to render as a hairline. */
  baseline?: number;
}

const TONE_VAR: Record<SparklineTone, string> = {
  neutral: "var(--text-md)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  crit: "var(--crit)",
  accent: "var(--accent)",
};

interface ScaleResult {
  pathD: string;
  areaD: string;
  lastX: number;
  lastY: number;
  baselineY: number | null;
}

function buildPaths(
  values: ReadonlyArray<number>,
  width: number,
  height: number,
  baseline?: number
): ScaleResult | null {
  const padX = 1;
  const padY = 1;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);

  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (baseline !== undefined && Number.isFinite(baseline)) {
    if (baseline < min) min = baseline;
    if (baseline > max) max = baseline;
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;

  const xFor = (i: number) => {
    if (finite.length === 1) return padX + innerW / 2;
    return padX + (i / (finite.length - 1)) * innerW;
  };
  const yFor = (v: number) => padY + (1 - (v - min) / range) * innerH;

  const points = finite.map((v, i) => `${xFor(i).toFixed(2)},${yFor(v).toFixed(2)}`);
  const pathD = `M${points.join("L")}`;
  const lastX = finite.length === 1 ? xFor(0) : xFor(finite.length - 1);
  const lastY = yFor(finite[finite.length - 1]!);
  const areaD = `${pathD}L${lastX.toFixed(2)},${(height - padY).toFixed(2)}L${padX.toFixed(2)},${(height - padY).toFixed(2)}Z`;
  const baselineY =
    baseline !== undefined && Number.isFinite(baseline) ? yFor(baseline) : null;

  return { pathD, areaD, lastX, lastY, baselineY };
}

export const Sparkline = forwardRef<SVGSVGElement, SparklineProps>(
  (
    {
      data,
      width = 120,
      height = 32,
      tone = "accent",
      fill = true,
      label,
      baseline,
      className,
      ...rest
    },
    ref
  ) => {
    const gradientId = useId();
    const stroke = TONE_VAR[tone];

    const built = useMemo(
      () => buildPaths(data, width, height, baseline),
      [data, width, height, baseline]
    );

    return (
      <svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("block overflow-visible", className)}
        aria-hidden={label ? undefined : true}
        role={label ? "img" : undefined}
        aria-label={label}
        {...rest}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {built ? (
          <>
            {built.baselineY !== null ? (
              <line
                x1={1}
                x2={width - 1}
                y1={built.baselineY}
                y2={built.baselineY}
                stroke="var(--hairline-strong)"
                strokeWidth={0.75}
                strokeDasharray="2 3"
              />
            ) : null}
            {fill ? <path d={built.areaD} fill={`url(#${gradientId})`} /> : null}
            <path
              d={built.pathD}
              fill="none"
              stroke={stroke}
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={built.lastX}
              cy={built.lastY}
              r={1.75}
              fill={stroke}
              stroke="var(--surface-1)"
              strokeWidth={0.75}
            />
          </>
        ) : null}
      </svg>
    );
  }
);
Sparkline.displayName = "Sparkline";
