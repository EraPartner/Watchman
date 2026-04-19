import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogPortal = D.Portal;
export const DialogClose = D.Close;

export const DialogOverlay = forwardRef<
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
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = forwardRef<
  ElementRef<typeof D.Content>,
  ComponentPropsWithoutRef<typeof D.Content>
>(({ className, children, ...rest }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <D.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        "w-[min(92vw,560px)] max-h-[85vh] overflow-auto",
        "bg-[var(--surface-1)] text-[var(--text-hi)]",
        "rounded-r-3 shadow-elev-3 p-s-6",
        "motion-fade-in",
        "focus:outline-none",
        className
      )}
      {...rest}
    >
      {children}
      <D.Close
        aria-label="Close"
        className="absolute right-s-3 top-s-3 rounded-r-2 p-s-1 text-[var(--text-lo)] hover:text-[var(--text-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <X size={16} />
      </D.Close>
    </D.Content>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

export const DialogTitle = forwardRef<
  ElementRef<typeof D.Title>,
  ComponentPropsWithoutRef<typeof D.Title>
>(({ className, ...rest }, ref) => (
  <D.Title
    ref={ref}
    className={cn("text-fs-h2 font-[600] tracking-[-0.01em]", className)}
    {...rest}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef<
  ElementRef<typeof D.Description>,
  ComponentPropsWithoutRef<typeof D.Description>
>(({ className, ...rest }, ref) => (
  <D.Description
    ref={ref}
    className={cn("text-fs-body text-[var(--text-md)]", className)}
    {...rest}
  />
));
DialogDescription.displayName = "DialogDescription";
