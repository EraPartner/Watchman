import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const surfaceVariants = cva(
  ["relative", "bg-[var(--surface-1)]", "text-[var(--text-hi)]", "rounded-r-3"],
  {
    variants: {
      elevation: {
        0: "bg-[var(--surface-0)]",
        1: "shadow-elev-1",
        2: "shadow-elev-2",
        3: "shadow-elev-3",
      },
      tone: {
        neutral: "",
        warn: "shadow-[inset_0_0_0_1px_var(--warn)]",
        crit: "shadow-[inset_0_0_0_1px_var(--crit)]",
        ok: "shadow-[inset_0_0_0_1px_var(--ok)]",
      },
      padding: {
        none: "p-0",
        sm: "p-s-3",
        md: "p-s-4",
        lg: "p-s-6",
      },
    },
    defaultVariants: { elevation: 1, tone: "neutral", padding: "md" },
  }
);

export interface SurfaceProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfaceVariants> {}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, elevation, tone, padding, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(surfaceVariants({ elevation, tone, padding }), className)}
      {...rest}
    />
  )
);
Surface.displayName = "Surface";

export { surfaceVariants };
