import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DashboardGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * 12-column bento grid with fixed 72px auto-rows. Tiles span col/row via
 * their `tileVariants` size class.
 */
export function DashboardGrid({ children, className }: DashboardGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-12 gap-s-4",
        "[grid-auto-rows:72px]",
        className
      )}
    >
      {children}
    </div>
  );
}
