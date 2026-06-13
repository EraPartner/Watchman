import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export const TabsList = forwardRef<
  ElementRef<typeof T.List>,
  ComponentPropsWithoutRef<typeof T.List>
>(({ className, ...rest }, ref) => (
  <T.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-s-1 p-s-1",
      "glass-thin rounded-r-2",
      className
    )}
    {...rest}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<
  ElementRef<typeof T.Trigger>,
  ComponentPropsWithoutRef<typeof T.Trigger>
>(({ className, ...rest }, ref) => (
  <T.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center",
      "px-s-3 h-7 rounded-r-1 text-fs-label",
      "text-[var(--text-md)]",
      "transition-colors duration-fast ease-out-q",
      "hover:text-[var(--text-hi)]",
      "data-[state=active]:bg-[var(--surface-3)] data-[state=active]:text-[var(--text-hi)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
      className
    )}
    {...rest}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef<
  ElementRef<typeof T.Content>,
  ComponentPropsWithoutRef<typeof T.Content>
>(({ className, ...rest }, ref) => (
  <T.Content
    ref={ref}
    className={cn("mt-s-3 focus:outline-none", className)}
    {...rest}
  />
));
TabsContent.displayName = "TabsContent";
