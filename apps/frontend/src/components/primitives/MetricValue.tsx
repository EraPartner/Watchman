import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const metricVariants = cva(
  ["inline-flex items-baseline gap-s-1", "font-mono tabular-nums", "text-[var(--text-hi)]"],
  {
    variants: {
      size: {
        sm: "text-fs-body",
        md: "text-fs-h3",
        lg: "text-fs-h1 font-[700] tracking-[-0.01em]",
        xl: "text-fs-display font-[700] tracking-[-0.02em]",
      },
      tone: {
        neutral: "",
        dim: "text-[var(--text-md)]",
        ok: "text-[var(--ok)]",
        warn: "text-[var(--warn)]",
        crit: "text-[var(--crit)]",
        accent: "text-[var(--accent)]",
      },
    },
    defaultVariants: { size: "md", tone: "neutral" },
  }
);

export interface MetricValueProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof metricVariants> {
  value: ReactNode;
  unit?: string;
  label?: string;
}

export const MetricValue = forwardRef<HTMLSpanElement, MetricValueProps>(
  ({ className, size, tone, value, unit, label, ...rest }, ref) => (
    <span
      ref={ref}
      className={cn(metricVariants({ size, tone }), className)}
      aria-label={label}
      {...rest}
    >
      <span>{value}</span>
      {unit ? (
        <span className="text-fs-label font-sans font-[500] text-[var(--text-lo)]">
          {unit}
        </span>
      ) : null}
    </span>
  )
);
MetricValue.displayName = "MetricValue";
