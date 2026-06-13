import { forwardRef, useId, useMemo, type SVGAttributes } from "react";
import { cn } from "@/lib/utils";

export type SparklineTone = "neutral" | "ok" | "warn" | "crit" | "accent";

export interface SparklineProps extends Omit<
  SVGAttributes<SVGSVGElement>,
  "children"
> {
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
  /** Stretch horizontally to fill the container (preserveAspectRatio: none). */
  stretch?: boolean;
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
}

/** Smooth a polyline with midpoint quadratic curves — calm, organic line. */
function smoothPath(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length === 0) return "";
  const p0 = pts[0]!;
  if (pts.length === 1) return `M${p0[0].toFixed(2)},${p0[1].toFixed(2)}`;
  let d = `M${p0[0].toFixed(2)},${p0[1].toFixed(2)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    const mx = (cx + nx) / 2;
    const my = (cy + ny) / 2;
    d += `Q${cx.toFixed(2)},${cy.toFixed(2)} ${mx.toFixed(2)},${my.toFixed(2)}`;
  }
  const last = pts[pts.length - 1]!;
  d += `L${last[0].toFixed(2)},${last[1].toFixed(2)}`;
  return d;
}

function buildPaths(
  values: ReadonlyArray<number>,
  width: number,
  height: number
): ScaleResult | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }

  // Reserve headroom so peaks never touch the top edge; constant series rest
  // on a calm low line rather than filling the whole box as a flat rectangle.
  const topFrac = 0.2;
  const botFrac = 0.96;
  const flat = max - min < 1e-9;

  const xFor = (i: number) =>
    finite.length === 1 ? width / 2 : (i / (finite.length - 1)) * width;
  const yFor = (v: number) => {
    if (flat) return height * 0.64;
    const t = (v - min) / (max - min);
    return height * (botFrac - t * (botFrac - topFrac));
  };

  const pts = finite.map((v, i) => [xFor(i), yFor(v)] as [number, number]);
  const pathD = smoothPath(pts);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const areaD = `${pathD}L${last[0].toFixed(2)},${height.toFixed(2)}L${first[0].toFixed(2)},${height.toFixed(2)}Z`;

  return { pathD, areaD, lastX: last[0], lastY: last[1] };
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
      stretch = false,
      className,
      ...rest
    },
    ref
  ) => {
    const gradientId = useId();
    const stroke = TONE_VAR[tone];
    const vbW = stretch ? 100 : width;

    const built = useMemo(
      () => buildPaths(data, vbW, height),
      [data, vbW, height]
    );

    return (
      <svg
        ref={ref}
        width={stretch ? "100%" : width}
        height={height}
        viewBox={`0 0 ${vbW} ${height}`}
        preserveAspectRatio={stretch ? "none" : "xMidYMid meet"}
        className={cn("block overflow-visible", className)}
        aria-hidden={label ? undefined : true}
        role={label ? "img" : undefined}
        aria-label={label}
        {...rest}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.24} />
            <stop offset="70%" stopColor={stroke} stopOpacity={0.04} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {built ? (
          <>
            {fill ? (
              <path d={built.areaD} fill={`url(#${gradientId})`} />
            ) : null}
            <path
              d={built.pathD}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.85}
            />
            {!stretch ? (
              <circle
                cx={built.lastX}
                cy={built.lastY}
                r={2}
                fill={stroke}
                stroke="var(--surface-1)"
                strokeWidth={0.75}
              />
            ) : null}
          </>
        ) : null}
      </svg>
    );
  }
);
Sparkline.displayName = "Sparkline";
