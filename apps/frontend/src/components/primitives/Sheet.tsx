import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right-anchored sheet built on Radix Dialog.
 * Used for ServiceDetailSheet in the bento dashboard.
 */

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;
export const SheetPortal = D.Portal;

export const SheetOverlay = forwardRef<
  ElementRef<typeof D.Overlay>,
  ComponentPropsWithoutRef<typeof D.Overlay>
>(({ className, ...rest }, ref) => (
  <D.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[oklch(0%_0_0_/_0.5)] backdrop-blur-sm",
      "motion-fade-in data-[state=closed]:motion-fade-out",
      className
    )}
    {...rest}
  />
));
SheetOverlay.displayName = "SheetOverlay";

export interface SheetContentProps
  extends ComponentPropsWithoutRef<typeof D.Content> {
  width?: string;
}

export const SheetContent = forwardRef<
  ElementRef<typeof D.Content>,
  SheetContentProps
>(({ className, children, width = "min(560px,94vw)", ...rest }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <D.Content
      ref={ref}
      className={cn(
        "fixed right-0 top-0 z-50 h-full",
        "bg-[var(--surface-1)] text-[var(--text-hi)]",
        "shadow-elev-3 border-l border-[var(--hairline-strong)]",
        "motion-sheet-in data-[state=closed]:motion-sheet-out",
        "focus:outline-none",
        "flex flex-col",
        className
      )}
      style={{ width }}
      {...rest}
    >
      {children}
      <D.Close
        aria-label="Close"
        className="absolute right-s-4 top-s-4 rounded-r-2 p-s-1 text-[var(--text-lo)] hover:text-[var(--text-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <X size={16} />
      </D.Close>
    </D.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({ className, ...rest }: ComponentPropsWithoutRef<"div">) => (
  <div
    className={cn(
      "px-s-6 py-s-4 border-b border-[var(--hairline)]",
      className
    )}
    {...rest}
  />
);

export const SheetBody = ({ className, ...rest }: ComponentPropsWithoutRef<"div">) => (
  <div className={cn("flex-1 overflow-auto px-s-6 py-s-4", className)} {...rest} />
);

export const SheetFooter = ({ className, ...rest }: ComponentPropsWithoutRef<"div">) => (
  <div
    className={cn(
      "px-s-6 py-s-4 border-t border-[var(--hairline)] flex items-center justify-end gap-s-2",
      className
    )}
    {...rest}
  />
);

export const SheetTitle = forwardRef<
  ElementRef<typeof D.Title>,
  ComponentPropsWithoutRef<typeof D.Title>
>(({ className, ...rest }, ref) => (
  <D.Title
    ref={ref}
    className={cn("text-fs-h2 font-[600] tracking-[-0.01em]", className)}
    {...rest}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = forwardRef<
  ElementRef<typeof D.Description>,
  ComponentPropsWithoutRef<typeof D.Description>
>(({ className, ...rest }, ref) => (
  <D.Description
    ref={ref}
    className={cn("text-fs-body text-[var(--text-md)]", className)}
    {...rest}
  />
));
SheetDescription.displayName = "SheetDescription";
