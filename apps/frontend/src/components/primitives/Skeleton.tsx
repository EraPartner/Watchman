import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Approx pixel height; width is controlled by className. */
  height?: number;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, height, style, ...rest }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-r-1",
        "bg-[var(--surface-2)]",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-[linear-gradient(90deg,transparent,var(--surface-3),transparent)]",
        "before:animate-[skeleton_1.4s_infinite] before:motion-reduce:animate-none",
        className
      )}
      style={{ ...(height ? { height: `${height}px` } : {}), ...style }}
      {...rest}
    />
  )
);
Skeleton.displayName = "Skeleton";

/* Keyframes appended once via CSS; declared here in a <style> tag when imported. */
