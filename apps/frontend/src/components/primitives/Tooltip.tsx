import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as T from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = T.Provider;
export const Tooltip = T.Root;
export const TooltipTrigger = T.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof T.Content>,
  ComponentPropsWithoutRef<typeof T.Content>
>(({ className, sideOffset = 6, ...rest }, ref) => (
  <T.Portal>
    <T.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-[260px] px-s-2 py-s-1",
        "rounded-r-1 bg-[var(--surface-3)] text-[var(--text-hi)]",
        "text-fs-label shadow-elev-2",
        "motion-fade-in data-[state=closed]:motion-fade-out",
        className
      )}
      {...rest}
    />
  </T.Portal>
));
TooltipContent.displayName = "TooltipContent";
