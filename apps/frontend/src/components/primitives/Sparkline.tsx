import { forwardRef, useId, useMemo, type SVGAttributes } from "react";
import { LinePath, AreaClosed } from "@visx/shape";
import { scaleLinear } from "@visx/scale";
import { curveMonotoneX } from "@visx/curve";
import { extent } from "d3-array";
import { cn } from "@/lib/utils";

export type SparklineTone = "neutral" | "ok" | "warn" | "crit" | "accent";

export interface SparklineProps extends Omit<SVGAttributes<SVGSVGElement>, "children"> {
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
}

const TONE_VAR: Record<SparklineTone, string> = {
  neutral: "var(--text-md)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  crit: "var(--crit)",
  accent: "var(--accent)",
};

export const Sparkline = forwardRef<SVGSVGElement, SparklineProps>(
  (
    { data, width = 120, height = 32, tone = "accent", fill = true, label, className, ...rest },
    ref
  ) => {
    const gradientId = useId();

    const series = useMemo(
      () =>
        data
          .map((v, i) => ({ i, v }))
          .filter((p) => Number.isFinite(p.v)),
      [data]
    );

    const { xScale, yScale, stroke } = useMemo(() => {
      const stroke = TONE_VAR[tone];
      if (series.length === 0) {
        return { xScale: null, yScale: null, stroke };
      }
      const [minV, maxV] = extent(series, (p) => p.v) as [number, number];
      const pad = maxV === minV ? 1 : (maxV - minV) * 0.1;
      const xScale = scaleLinear<number>({
        domain: [0, Math.max(series.length - 1, 1)],
        range: [1, width - 1],
      });
      const yScale = scaleLinear<number>({
        domain: [minV - pad, maxV + pad],
        range: [height - 1, 1],
      });
      return { xScale, yScale, stroke };
    }, [series, width, height, tone]);

    if (!xScale || !yScale) {
      return (
        <svg
          ref={ref}
          width={width}
          height={height}
          className={cn("block", className)}
          aria-hidden={label ? undefined : true}
          role={label ? "img" : undefined}
          aria-label={label}
          {...rest}
        />
      );
    }

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
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {fill && (
          <AreaClosed
            data={series}
            x={(d) => xScale(d.i) ?? 0}
            y={(d) => yScale(d.v) ?? 0}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={`url(#${gradientId})`}
          />
        )}
        <LinePath
          data={series}
          x={(d) => xScale(d.i) ?? 0}
          y={(d) => yScale(d.v) ?? 0}
          curve={curveMonotoneX}
          stroke={stroke}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }
);
Sparkline.displayName = "Sparkline";
