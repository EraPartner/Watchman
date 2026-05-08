import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as T from "@radix-ui/react-toggle";
import { cn } from "@/lib/utils";

export const Toggle = forwardRef<
  ElementRef<typeof T.Root>,
  ComponentPropsWithoutRef<typeof T.Root>
>(({ className, ...rest }, ref) => (
  <T.Root
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center",
      "h-7 px-s-3 rounded-r-1 text-fs-label",
      "text-[var(--text-md)]",
      "transition-colors duration-fast ease-out-q",
      "hover:text-[var(--text-hi)]",
      "data-[state=on]:bg-[var(--accent-soft)] data-[state=on]:text-[var(--text-hi)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
      "disabled:opacity-50 disabled:pointer-events-none",
      className
    )}
    {...rest}
  />
));
Toggle.displayName = "Toggle";

export type ToggleGroupProps = ComponentPropsWithoutRef<"div">;

export const ToggleGroup = forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      role="group"
      className={cn(
        "inline-flex items-center gap-s-1 p-s-1",
        "rounded-r-2 bg-[var(--surface-2)] shadow-[inset_0_0_0_1px_var(--hairline)]",
        className
      )}
      {...rest}
    />
  )
);
ToggleGroup.displayName = "ToggleGroup";
