import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as S from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

export const ScrollArea = forwardRef<
  ElementRef<typeof S.Root>,
  ComponentPropsWithoutRef<typeof S.Root>
>(({ className, children, ...rest }, ref) => (
  <S.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...rest}
  >
    <S.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </S.Viewport>
    <ScrollBar orientation="vertical" />
    <ScrollBar orientation="horizontal" />
    <S.Corner />
  </S.Root>
));
ScrollArea.displayName = "ScrollArea";

export const ScrollBar = forwardRef<
  ElementRef<typeof S.ScrollAreaScrollbar>,
  ComponentPropsWithoutRef<typeof S.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...rest }, ref) => (
  <S.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors duration-fast ease-out-q",
      orientation === "vertical" && "h-full w-1.5 border-l border-transparent",
      orientation === "horizontal" &&
        "h-1.5 w-full flex-col border-t border-transparent",
      className
    )}
    {...rest}
  >
    <S.ScrollAreaThumb className="relative flex-1 rounded-r-pill bg-[var(--hairline-strong)]" />
  </S.ScrollAreaScrollbar>
));
ScrollBar.displayName = "ScrollBar";
