import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-s-1",
    "h-5 px-s-2 rounded-r-pill",
    "text-fs-label font-[500]",
    "select-none",
  ],
  {
    variants: {
      tone: {
        neutral: "bg-[var(--surface-2)] text-[var(--text-md)]",
        ok: "bg-[var(--ok-soft)] text-[var(--ok)]",
        warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
        crit: "bg-[var(--crit-soft)] text-[var(--crit)]",
        accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
        mono: "bg-[var(--surface-2)] text-[var(--text-md)] font-mono tabular-nums",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...rest }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...rest} />
  )
);
Badge.displayName = "Badge";

export { badgeVariants };
