import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const surfaceVariants = cva(
  ["relative", "text-[var(--text-hi)]", "rounded-r-3"],
  {
    variants: {
      // `solid` keeps the original flat depth ladder; `glass` swaps in the
      // frosted liquid-glass material (background + shadow come from the
      // .glass-regular utility, so elevation/tone box-shadows are dropped).
      material: {
        solid: "bg-[var(--surface-1)]",
        glass: "glass-regular",
      },
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
    defaultVariants: { material: "solid", padding: "md" },
  }
);

export interface SurfaceProps
  extends
    HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfaceVariants> {}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  (
    { className, material = "solid", elevation, tone, padding, ...rest },
    ref
  ) => {
    // Glass brings its own surface + depth via the .glass-regular utility;
    // applying elevation/tone box-shadows would override it, so suppress them
    // for glass and keep the original defaults (elev 1 / neutral) for solid.
    const glass = material === "glass";
    return (
      <div
        ref={ref}
        className={cn(
          surfaceVariants({
            material,
            elevation: glass ? undefined : (elevation ?? 1),
            tone: glass ? undefined : (tone ?? "neutral"),
            padding,
          }),
          className
        )}
        {...rest}
      />
    );
  }
);
Surface.displayName = "Surface";

export { surfaceVariants };
