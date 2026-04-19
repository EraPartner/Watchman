import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as P from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export const PopoverContent = forwardRef<
  ElementRef<typeof P.Content>,
  ComponentPropsWithoutRef<typeof P.Content>
>(({ className, align = "start", sideOffset = 6, ...rest }, ref) => (
  <P.Portal>
    <P.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[160px] p-s-2",
        "rounded-r-2 bg-[var(--surface-2)] text-[var(--text-hi)]",
        "shadow-elev-2",
        "motion-fade-in data-[state=closed]:motion-fade-out",
        "focus:outline-none",
        className
      )}
      {...rest}
    />
  </P.Portal>
));
PopoverContent.displayName = "PopoverContent";
