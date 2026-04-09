import React from "react";
import { cn } from "@/lib/utils";

interface MetricRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}

export function MetricRow({
  icon,
  label,
  value,
  valueClassName,
}: MetricRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        {icon} {label}
      </div>
      <div className={cn("font-mono font-semibold text-sm", valueClassName)}>
        {value}
      </div>
    </div>
  );
}
