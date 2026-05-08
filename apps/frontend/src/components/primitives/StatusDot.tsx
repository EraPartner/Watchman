import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const dotVariants = cva(
  ["inline-block rounded-full", "shadow-[0_0_0_2px_var(--surface-1)]"],
  {
    variants: {
      tone: {
        // ok → circle (base rounded-full kept)
        ok: "bg-[var(--ok)]",
        // warn → diamond (clip-path overrides border-radius)
        warn: "bg-[var(--warn)] rounded-none [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]",
        // crit → square (rounded-none overrides base rounded-full)
        crit: "bg-[var(--crit)] rounded-[2px]",
        // neutral → short rectangle / dash
        neutral: "bg-[var(--text-lo)] rounded-[1px] [aspect-ratio:2/1]",
      },
      size: {
        sm: "h-1.5 w-1.5",
        md: "h-2 w-2",
        lg: "h-2.5 w-2.5",
      },
      pulse: {
        true: "relative after:absolute after:inset-0 after:rounded-full after:bg-current after:opacity-60 after:animate-ping motion-reduce:after:hidden",
        false: "",
      },
    },
    defaultVariants: { tone: "ok", size: "md", pulse: false },
  }
);

export interface StatusDotProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof dotVariants> {
  label?: string;
}

export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ className, tone, size, pulse, label, ...rest }, ref) => (
    <span
      ref={ref}
      role="status"
      aria-label={label ?? tone ?? undefined}
      data-state={tone ?? "ok"}
      className={cn(dotVariants({ tone, size, pulse }), className)}
      {...rest}
    />
  )
);
StatusDot.displayName = "StatusDot";
