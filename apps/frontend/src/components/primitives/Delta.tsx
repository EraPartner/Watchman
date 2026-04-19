import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const deltaVariants = cva(
  ["inline-flex items-center gap-[2px]", "font-mono tabular-nums", "text-fs-label font-[500]"],
  {
    variants: {
      size: {
        sm: "text-fs-label",
        md: "text-fs-body",
        lg: "text-fs-h3",
      },
      tone: {
        auto: "",
        ok: "text-[var(--ok)]",
        crit: "text-[var(--crit)]",
        neutral: "text-[var(--text-md)]",
      },
    },
    defaultVariants: { size: "sm", tone: "auto" },
  }
);

export interface DeltaProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof deltaVariants> {
  /** Signed numeric delta (positive = up, negative = down). */
  value: number;
  /** Optional unit suffix (e.g. "%", "ms"). */
  unit?: string;
  /** Precision for fixed-point formatting. Defaults to 0 for ints, 2 for floats. */
  precision?: number;
  /** Invert color semantics (i.e. down is good). */
  invert?: boolean;
  /** Hide the direction arrow. */
  hideArrow?: boolean;
}

const formatValue = (v: number, precision?: number): string => {
  const p = precision ?? (Number.isInteger(v) ? 0 : 2);
  return Math.abs(v).toFixed(p);
};

export const Delta = forwardRef<HTMLSpanElement, DeltaProps>(
  (
    { className, size, tone = "auto", value, unit, precision, invert = false, hideArrow, ...rest },
    ref
  ) => {
    const isZero = value === 0;
    const isUp = value > 0;
    const resolvedTone =
      tone === "auto"
        ? isZero
          ? "neutral"
          : (isUp ? !invert : invert)
            ? "ok"
            : "crit"
        : tone;

    const arrow = isZero ? "→" : isUp ? "↑" : "↓";
    const sign = isZero ? "" : isUp ? "+" : "−";

    return (
      <span
        ref={ref}
        className={cn(deltaVariants({ size, tone: resolvedTone }), className)}
        {...rest}
      >
        {!hideArrow && <span aria-hidden>{arrow}</span>}
        <span>
          {sign}
          {formatValue(value, precision)}
          {unit ?? ""}
        </span>
      </span>
    );
  }
);
Delta.displayName = "Delta";
